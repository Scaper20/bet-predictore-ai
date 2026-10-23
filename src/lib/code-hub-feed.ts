import "server-only";

import { after } from "next/server";
import { cached } from "@/lib/providers/cache";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { candidatesFor, type ForgeLeg } from "@/lib/forge";
import { appDayBounds } from "@/lib/format";
import { priceQuotes } from "@/lib/odds";
import { bookingAvailable, bookingCodeFor } from "@/lib/odds/booking-code";
import { findOnBoard } from "@/lib/odds/sportybet";
import { offeredOn, toSportyBet } from "@/lib/odds/markets";
import { allSportyBetTournaments, logBooking } from "@/lib/odds/sportybet-links";
import type { BookingLeg } from "@/lib/odds/booking";
import {
  CODE_RUN_MS,
  HUB_FORGE_MARKETS,
  buildHub,
  codeRunning,
  hubDay,
  hubTotals,
  toHubLeg,
  type FinalScore,
  type HubLeg,
  type HubTierId,
} from "@/lib/code-hub";

/**
 * The Code Hub's server side: publishing the day's combos, booking their
 * codes, and reading back past days with their results.
 *
 * Reads and writes public.code_hub_codes (migration 0054) with the service
 * role. That is shared, non-personal data; what each viewer may see of it is
 * decided afterwards by hubAccess(), never by a query run with their key.
 *
 * Until 0054 is applied the table is missing, and the hub still renders:
 * today's combos are built in memory (shared for 30 minutes per instance)
 * and there is no history. That is the preview mode the page runs in before
 * launch.
 */

export interface HubCodeRow {
  day: string;
  tier: HubTierId;
  legs: HubLeg[];
  odds: number;
  probability: number;
  firstKickoff: number;
  lastKickoff: number;
  bookingCode: string | null;
  bookingDeadline: string | null;
}

interface DbRow {
  day: string;
  tier: string;
  legs: HubLeg[];
  odds: number | string;
  probability: number | string;
  first_kickoff: string;
  last_kickoff: string;
  booking_code: string | null;
  booking_deadline: string | null;
}

const COLUMNS = "day, tier, legs, odds, probability, first_kickoff, last_kickoff, booking_code, booking_deadline";

function fromDb(r: DbRow): HubCodeRow {
  return {
    day: r.day,
    tier: r.tier as HubTierId,
    legs: r.legs,
    odds: Number(r.odds),
    probability: Number(r.probability),
    firstKickoff: Date.parse(r.first_kickoff),
    lastKickoff: Date.parse(r.last_kickoff),
    bookingCode: r.booking_code,
    bookingDeadline: r.booking_deadline,
  };
}

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

/** Games closer than this to kickoff are left out of a new hub: the code has to be loadable. */
const LEAD_MS = 30 * 60_000;
/** How long the hub waits for SportyBet prices before publishing the missing ones at fair odds. */
const PRICE_BUDGET_MS = 10_000;

/** SportyBet's price on each leg, where its board has one, within a fixed budget. */
async function priceLegs(legs: ForgeLeg[]): Promise<ForgeLeg[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PRICE_BUDGET_MS);
  });
  const lookup = priceQuotes(
    legs.map((l) => ({
      homeName: l.homeName,
      awayName: l.awayName,
      kickoff: Date.parse(l.kickoff),
      leagueCode: l.leagueCode,
      market: l.market,
      label: l.label,
      probability: l.probability,
      fairOdds: l.fairOdds,
    })),
  ).catch(() => null);
  const priced = await Promise.race([lookup, deadline]);
  clearTimeout(timer);
  return legs.map((l, i) => ({ ...l, price: priced?.[i]?.local ?? null }));
}

/**
 * Today's combos, freshly built from the model. Nothing is stored here.
 *
 * Every code uses today's games (Lagos day); the four-day codes that once
 * reached ahead are retired (code-hub.ts). Run by the 07:00 cron, so the
 * whole day's slate is in the pool rather than whatever is left when someone
 * first opens the page.
 */
async function buildToday(day: string): Promise<HubCodeRow[]> {
  const now = new Date();
  const soon = now.getTime() + LEAD_MS;
  const todayEnd = appDayBounds(now).end.getTime();
  const [{ matches }, onSportyBet] = await Promise.all([upcomingFeed(2), allSportyBetTournaments()]);
  const inWindow = matches.filter((m) => {
    const t = Date.parse(m.kickoff);
    const code = m.league.code;
    // Only competitions SportyBet's board can be asked for by id: a leg on
    // any other game could never be turned into a code.
    return m.status === "scheduled" && t > soon && t < todayEnd && Boolean(code && onSportyBet.has(code));
  });
  const predictions = (await predictBatch(inWindow, 400)).filter((p) => p.sufficiency.publishable);
  const entry = (prediction: (typeof predictions)[number]) => ({
    prediction,
    candidates: candidatesFor(prediction, { markets: HUB_FORGE_MARKETS, picksPerGame: 1, allowHandicap: true }),
  });
  const today = predictions.map(entry);

  const built = buildHub(today, day);
  return Promise.all(
    built.map(async ({ tier, legs }) => {
      const hubLegs = (await priceLegs(legs)).map(toHubLeg);
      const t = hubTotals(hubLegs);
      return {
        day,
        tier,
        legs: hubLegs,
        odds: Math.round(t.odds * 100) / 100,
        probability: Math.round(t.probability * 1e5) / 1e5,
        firstKickoff: t.firstKickoff,
        lastKickoff: t.lastKickoff,
        bookingCode: null,
        bookingDeadline: null,
      };
    }),
  );
}

type StoreRead = { ok: true; rows: HubCodeRow[] } | { ok: false };

async function readDay(day: string): Promise<StoreRead> {
  try {
    const db = await admin();
    const { data, error } = await db.from("code_hub_codes").select(COLUMNS).eq("day", day);
    if (error) return { ok: false };
    return { ok: true, rows: (data as DbRow[]).map(fromDb) };
  } catch {
    return { ok: false };
  }
}

/**
 * Books a code for every stored combo that has none, after the response has
 * gone out. Booked on SportyBet directly, or through parse.bot's metered
 * client when that is off; a combo whose games cannot all be found on
 * SportyBet's board is left without a code rather than booked short.
 */
function bookMissing(rows: HubCodeRow[]) {
  const due = rows.filter((r) => !r.bookingCode && r.firstKickoff - Date.now() > LEAD_MS);
  if (due.length === 0) return;
  after(async () => {
    if (!(await bookingAvailable())) return;
    for (const row of due) {
      const legs: BookingLeg[] = [];
      for (const leg of row.legs) {
        const kickoff = Date.parse(leg.kickoff);
        const event = await findOnBoard(
          { homeName: leg.homeName, awayName: leg.awayName, kickoff },
          { leagueCode: leg.leagueCode, matchId: leg.matchId },
        ).catch(() => null);
        if (!event) break;
        // A line SportyBet isn't offering on the day would get the whole code
        // refused; leave the combo without a code instead, as for an unlisted game.
        const selection = toSportyBet(leg.market);
        if (!selection || (event.markets.length > 0 && !offeredOn(selection, event.markets))) break;
        legs.push({ market: leg.market, eventId: event.eventId, kickoff });
      }
      if (legs.length !== row.legs.length) {
        await logBooking({ source: "code-hub", legs: row.legs.length, outcome: "problems", problems: { found: legs.length } });
        continue;
      }

      const started = Date.now();
      const booked = await bookingCodeFor(legs);
      await logBooking({
        source: "code-hub",
        legs: legs.length,
        outcome: booked.ok ? (booked.cached ? "cached" : "booked") : booked.reason === "invalid" ? "problems" : "refused",
        via: booked.ok && booked.via !== "cache" ? booked.via : null,
        code: booked.ok ? booked.bookingCode : null,
        readBack: booked.ok ? booked.readBack : null,
        problems: booked.ok || booked.reason !== "invalid" ? null : booked.problems,
        durationMs: Date.now() - started,
      });
      if (!booked.ok) continue;
      try {
        const db = await admin();
        await db
          .from("code_hub_codes")
          .update({
            booking_code: booked.bookingCode,
            booking_deadline: new Date(booked.deadline).toISOString(),
            booked_at: new Date().toISOString(),
          })
          .eq("day", row.day)
          .eq("tier", row.tier)
          .is("booking_code", null);
      } catch {
        // Retried on the next request: the row still has no code.
      }
    }
  });
}

export interface TodayHub {
  day: string;
  codes: HubCodeRow[];
  /** False before migration 0054: the combos are a live preview and nothing is kept. */
  stored: boolean;
  /** When this was read, so the page judges kickoffs against one clock. */
  now: number;
}

/**
 * Today's hub: the stored copy when there is one, otherwise built now and
 * stored, so every later request (and every instance) shows the same combos.
 */
export async function todayHub(): Promise<TodayHub> {
  const hub = await readTodayHub();
  return { ...hub, now: Date.now() };
}

async function readTodayHub(): Promise<Omit<TodayHub, "now">> {
  const day = hubDay();
  const read = await readDay(day);

  if (!read.ok) {
    const codes = await cached(`code-hub:preview:${day}`, 30 * 60_000, () => buildToday(day));
    return { day, codes, stored: false };
  }
  if (read.rows.length > 0) {
    bookMissing(read.rows);
    return { day, codes: sortTiers(read.rows), stored: true };
  }

  // First request of the day. One build per instance at a time; the insert
  // ignores rows another instance already wrote, and the read-back makes
  // everyone show whichever copy landed first.
  const built = await cached(`code-hub:build:${day}`, 5 * 60_000, () => buildToday(day));
  if (built.length > 0) {
    try {
      const db = await admin();
      await db.from("code_hub_codes").upsert(
        built.map((r) => ({
          day: r.day,
          tier: r.tier,
          legs: r.legs,
          odds: r.odds,
          probability: r.probability,
          first_kickoff: new Date(r.firstKickoff).toISOString(),
          last_kickoff: new Date(r.lastKickoff).toISOString(),
        })),
        { onConflict: "day,tier", ignoreDuplicates: true },
      );
    } catch {
      return { day, codes: built, stored: false };
    }
  }
  const again = await readDay(day);
  const codes = again.ok && again.rows.length > 0 ? sortTiers(again.rows) : built;
  bookMissing(codes);
  return { day, codes, stored: again.ok };
}

const TIER_ORDER: HubTierId[] = ["2", "3", "5", "10", "20", "50", "100"];
function sortTiers(rows: HubCodeRow[]): HubCodeRow[] {
  return [...rows].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}

/**
 * Codes from the last few days whose games are still being played: the
 * four-day codes, which outlive the day they were published on. They stay
 * on the page beside today's until their last game ends.
 */
export async function runningHub(now = Date.now()): Promise<HubCodeRow[]> {
  return cached(`code-hub:running:${hubDay()}:${Math.floor(now / 60_000)}`, 60_000, async () => {
    try {
      const db = await admin();
      const since = hubDay(new Date(now - 4 * 86_400_000));
      const { data, error } = await db
        .from("code_hub_codes")
        .select(COLUMNS)
        .gte("day", since)
        .lt("day", hubDay(new Date(now)))
        .gt("last_kickoff", new Date(now - CODE_RUN_MS).toISOString())
        .order("day", { ascending: false });
      if (error || !data) return [];
      const rows = (data as DbRow[]).map(fromDb);
      bookMissing(rows);
      return rows;
    } catch {
      return [];
    }
  });
}

export interface PastHubDay {
  day: string;
  codes: HubCodeRow[];
}

/**
 * The last few days of published combos, newest first, with the final
 * scores of their games. Empty before migration 0054.
 */
export async function pastHub(days = 7): Promise<{ days: PastHubDay[]; scores: Record<string, FinalScore> }> {
  const empty = { days: [], scores: {} };
  return cached(`code-hub:past:${hubDay()}`, 10 * 60_000, async () => {
    try {
      const db = await admin();
      const today = hubDay();
      const since = hubDay(new Date(Date.now() - days * 86_400_000));
      const { data, error } = await db
        .from("code_hub_codes")
        .select(COLUMNS)
        .lt("day", today)
        .gte("day", since)
        .order("day", { ascending: false });
      if (error || !data) return empty;
      // Codes still in play are shown with today's (runningHub), not here.
      const rows = (data as DbRow[]).map(fromDb).filter((r) => !codeRunning(r.lastKickoff));

      const ids = [...new Set(rows.flatMap((r) => r.legs.map((l) => l.matchId)))];
      const scores: Record<string, FinalScore> = {};
      if (ids.length > 0) {
        const { data: results } = await db
          .from("match_results")
          .select("match_id, home_goals, away_goals")
          .in("match_id", ids)
          .eq("status", "finished");
        for (const r of results ?? []) {
          if (typeof r.home_goals === "number" && typeof r.away_goals === "number") {
            scores[r.match_id as string] = { home: r.home_goals, away: r.away_goals };
          }
        }
      }

      const byDay = new Map<string, HubCodeRow[]>();
      for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
      return {
        days: [...byDay.entries()].map(([day, codes]) => ({ day, codes: sortTiers(codes) })),
        scores,
      };
    } catch {
      return empty;
    }
  });
}

/** Final scores for today's games that are already over, for the live status on today's cards. */
export async function finishedScores(matchIds: string[]): Promise<Record<string, FinalScore>> {
  if (matchIds.length === 0) return {};
  try {
    const { supabasePublic } = await import("@/lib/supabase/public");
    const db = supabasePublic();
    if (!db) return {};
    const { data } = await db
      .from("match_results")
      .select("match_id, home_goals, away_goals")
      .in("match_id", matchIds)
      .eq("status", "finished");
    const out: Record<string, FinalScore> = {};
    for (const r of data ?? []) {
      if (typeof r.home_goals === "number" && typeof r.away_goals === "number") {
        out[r.match_id as string] = { home: r.home_goals, away: r.away_goals };
      }
    }
    return out;
  } catch {
    return {};
  }
}
