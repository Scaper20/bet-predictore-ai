import "server-only";

import { leagueByCode } from "@/lib/leagues";
import { normaliseKey } from "@/lib/model/fit";
import { cached } from "@/lib/providers/cache";
import type { LearnedLink, MatchInput, MatchMethod, UnresolvedFixture } from "./sportybet-match";
import type { SportyBetEvent } from "./sportybet-api";
import type { Discovery } from "./sportybet-discover";
import type { CompactPrices, Snapshot } from "./market-prob";

/**
 * What the SportyBet matcher remembers, in the tables from migration 0066.
 *
 * Every read degrades to "nothing remembered" (the matcher then works from
 * names alone, as it always did), and every write is best effort: losing a
 * link costs a re-match next time, never a wrong match.
 */

const PENDING_TO_TRUSTED = 2;

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

interface CompetitorRow {
  competitor_id: string;
  team_key: string;
  team_name: string;
  sportybet_name: string;
  method: string;
  status: "trusted" | "pending" | "rejected";
  confirmations: number;
}

async function competitorRows(leagueCode: string): Promise<CompetitorRow[]> {
  try {
    const { data, error } = await (await admin())
      .from("sportybet_competitors")
      .select("competitor_id, team_key, team_name, sportybet_name, method, status, confirmations")
      .eq("league_code", leagueCode);
    return error ? [] : ((data ?? []) as CompetitorRow[]);
  } catch {
    return [];
  }
}

/** Our extra names for these clubs, from team_aliases, keyed by team key. */
async function aliasesFor(names: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (names.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("teams")
      .select("name, team_aliases(alias)")
      .in("name", [...new Set(names)]);
    for (const row of (data ?? []) as { name: string; team_aliases: { alias: string }[] | null }[]) {
      const key = normaliseKey(row.name);
      const list = out.get(key) ?? [];
      for (const a of row.team_aliases ?? []) if (a.alias && !list.includes(a.alias)) list.push(a.alias);
      out.set(key, list);
    }
  } catch {
    // Names alone, then.
  }
  return out;
}

/** The matcher's memory for one competition, cached briefly per instance. */
export function memoryFor(
  leagueCode: string,
  names: readonly string[],
): Promise<Pick<MatchInput, "links" | "aliases" | "rejected">> {
  const sorted = [...new Set(names)].sort();
  return cached(`sportybet:memory:${leagueCode}:${sorted.join("|")}`, 5 * 60_000, async () => {
    const [rows, aliases] = await Promise.all([competitorRows(leagueCode), aliasesFor(sorted)]);
    return {
      links: new Map(rows.filter((r) => r.status === "trusted").map((r) => [r.team_key, r.competitor_id])),
      rejected: new Set(rows.filter((r) => r.status === "rejected").map((r) => `${r.team_key}|${r.competitor_id}`)),
      aliases,
    };
  });
}

/**
 * Stores what a match taught. A link already pending is confirmed; it turns
 * trusted on its second sighting. A different id for a club with a pending
 * link replaces it, since neither sighting was sure.
 */
export async function saveLearned(leagueCode: string, learned: readonly LearnedLink[]): Promise<void> {
  if (learned.length === 0) return;
  try {
    const db = await admin();
    const existing = await competitorRows(leagueCode);
    const now = new Date().toISOString();
    for (const link of learned) {
      const same = existing.find((r) => r.team_key === link.teamKey && r.competitor_id === link.competitorId);
      if (same?.status === "rejected") continue;
      if (same) {
        const confirmations = same.confirmations + 1;
        const status = same.status === "trusted" || confirmations >= PENDING_TO_TRUSTED || link.status === "trusted"
          ? "trusted"
          : "pending";
        await db
          .from("sportybet_competitors")
          .update({ confirmations, status, last_seen: now, sportybet_name: link.sportybetName })
          .eq("league_code", leagueCode)
          .eq("team_key", link.teamKey)
          .eq("competitor_id", link.competitorId);
        continue;
      }
      // A pending guess for either side gives way to this sighting.
      const stale = existing.filter(
        (r) =>
          r.status === "pending" && (r.team_key === link.teamKey || r.competitor_id === link.competitorId),
      );
      for (const r of stale) {
        await db
          .from("sportybet_competitors")
          .delete()
          .eq("league_code", leagueCode)
          .eq("team_key", r.team_key)
          .eq("competitor_id", r.competitor_id);
      }
      const blocked = existing.some(
        (r) => r.status === "trusted" && (r.team_key === link.teamKey || r.competitor_id === link.competitorId),
      );
      if (blocked) continue;
      await db.from("sportybet_competitors").insert({
        competitor_id: link.competitorId,
        league_code: leagueCode,
        team_key: link.teamKey,
        team_name: link.teamName,
        sportybet_name: link.sportybetName,
        method: link.method,
        status: link.status,
        first_seen: now,
        last_seen: now,
      });
    }
  } catch {
    // Relearned next time.
  }
}

export interface StoredEventLink {
  eventId: string;
  method: MatchMethod | "manual";
}

/** The SportyBet event already matched to this fixture, if any. */
export async function storedEventLink(matchId: string): Promise<StoredEventLink | null> {
  try {
    const { data } = await (await admin())
      .from("sportybet_event_links")
      .select("event_id, method")
      .eq("match_id", matchId)
      .maybeSingle();
    return data ? { eventId: data.event_id, method: data.method } : null;
  } catch {
    return null;
  }
}

/** Stored links for many fixtures at once, by match id. */
export async function storedEventLinks(matchIds: readonly string[]): Promise<Map<string, StoredEventLink>> {
  const out = new Map<string, StoredEventLink>();
  if (matchIds.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("sportybet_event_links")
      .select("match_id, event_id, method")
      .in("match_id", [...matchIds]);
    for (const r of data ?? []) out.set(r.match_id, { eventId: r.event_id, method: r.method });
  } catch {
    // Matched afresh.
  }
  return out;
}

export async function saveEventLinks(
  leagueCode: string,
  links: readonly { matchId: string; event: SportyBetEvent; method: MatchMethod | "manual" }[],
): Promise<void> {
  if (links.length === 0) return;
  try {
    const db = await admin();
    await db.from("sportybet_event_links").upsert(
      links.map((l) => ({
        match_id: l.matchId,
        league_code: leagueCode,
        event_id: l.event.eventId,
        tournament_id: l.event.tournamentId ?? null,
        home_name: l.event.homeName,
        away_name: l.event.awayName,
        home_id: l.event.homeId ?? null,
        away_id: l.event.awayId ?? null,
        kickoff: new Date(l.event.kickoff).toISOString(),
        method: l.method,
        linked_at: new Date().toISOString(),
        // A new or changed link has not been checked against a result yet.
        verdict: null,
        our_score: null,
        sportybet_score: null,
        verified_at: null,
        verify_attempts: 0,
      })),
      { onConflict: "match_id" },
    );
    await db
      .from("sportybet_unresolved")
      .delete()
      .in(
        "match_id",
        links.map((l) => l.matchId),
      );
  } catch {
    // Re-matched next time.
  }
}

export async function saveUnresolved(
  leagueCode: string,
  fixtures: ReadonlyMap<string, { homeName: string; awayName: string; kickoff: number }>,
  unresolved: readonly UnresolvedFixture[],
): Promise<void> {
  if (unresolved.length === 0) return;
  try {
    await (await admin()).from("sportybet_unresolved").upsert(
      unresolved.flatMap((u) => {
        const f = fixtures.get(u.matchId);
        if (!f) return [];
        return [
          {
            match_id: u.matchId,
            league_code: leagueCode,
            home_name: f.homeName,
            away_name: f.awayName,
            kickoff: new Date(f.kickoff).toISOString(),
            candidates: u.candidates,
            seen_at: new Date().toISOString(),
          },
        ];
      }),
      { onConflict: "match_id" },
    );
  } catch {
    // The admin list is a convenience.
  }
}

export interface BookingLogEntry {
  source: "slip" | "code-hub";
  userId?: string | null;
  legs: number;
  outcome: "booked" | "cached" | "problems" | "refused" | "unavailable";
  via?: "direct" | "parsebot" | null;
  code?: string | null;
  readBack?: boolean | null;
  problems?: unknown;
  durationMs?: number;
}

/** Records one booking attempt for /admin/sportybet. Best effort. */
export async function logBooking(entry: BookingLogEntry): Promise<void> {
  try {
    await (await admin()).from("sportybet_booking_log").insert({
      source: entry.source,
      user_id: entry.userId ?? null,
      legs: entry.legs,
      outcome: entry.outcome,
      via: entry.via ?? null,
      code: entry.code ?? null,
      read_back: entry.readBack ?? null,
      problems: entry.problems ?? null,
      duration_ms: entry.durationMs ?? null,
    });
  } catch {
    // The log is for the admin page; a lost row costs nothing else.
  }
}

/**
 * The distinct codes a member was given since `since`, each with when it was
 * first given: what their weekly allowance is counted from. Null when the log
 * cannot be read, so the caller can refuse rather than hand out codes blind.
 */
export async function codesGivenTo(userId: string, since: number): Promise<Map<string, number> | null> {
  try {
    const { data, error } = await (await admin())
      .from("sportybet_booking_log")
      .select("code, at")
      .eq("user_id", userId)
      .in("outcome", ["booked", "cached"])
      .not("code", "is", null)
      .gte("at", new Date(since).toISOString());
    if (error) return null;
    const first = new Map<string, number>();
    for (const r of (data ?? []) as { code: string; at: string }[]) {
      const at = Date.parse(r.at);
      if (!first.has(r.code) || at < first.get(r.code)!) first.set(r.code, at);
    }
    return first;
  } catch {
    return null;
  }
}

export interface TournamentRow {
  league_code: string;
  tournament_id: string;
  tournament_name: string;
  category: string;
  votes: number;
  runner_up_votes: number;
  fixtures: number;
  status: "trusted" | "pending" | "rejected";
  method: "discovered" | "manual";
  updated_at: string;
}

/** Every stored tournament row, for the admin page and the lookup below. */
export async function tournamentRows(): Promise<TournamentRow[]> {
  try {
    const { data, error } = await (await admin()).from("sportybet_tournaments").select("*");
    return error ? [] : ((data ?? []) as TournamentRow[]);
  } catch {
    return [];
  }
}

/**
 * Trusted discovered ids, held for five minutes per instance. Kept here
 * rather than in the shared TTL cache so a discovery or an admin's decision
 * can clear it at once (forgetTournaments) and the sync that follows sees it.
 */
let trusted: { at: number; map: Promise<Map<string, string>> } | null = null;

function trustedTournaments(): Promise<Map<string, string>> {
  if (!trusted || Date.now() - trusted.at > 5 * 60_000) {
    trusted = {
      at: Date.now(),
      map: tournamentRows().then((rows) => {
        const out = new Map<string, string>();
        for (const r of rows) if (r.status === "trusted") out.set(r.league_code, r.tournament_id);
        return out;
      }),
    };
  }
  return trusted.map;
}

export function forgetTournaments(): void {
  trusted = null;
}

/**
 * A competition's SportyBet tournament id, or null when it has none yet.
 *
 * The hand-set id in leagues.ts first, always; otherwise one found from
 * evidence and trusted (sportybet-discover.ts). Every SportyBet path asks
 * here rather than reading leagues.ts, so a competition found tonight has
 * prices and codes tomorrow without a deploy.
 */
export async function sportyBetTournament(leagueCode: string | undefined): Promise<string | null> {
  if (!leagueCode) return null;
  const set = leagueByCode(leagueCode)?.ids.sportyBet;
  if (set) return set;
  return (await trustedTournaments()).get(leagueCode) ?? null;
}

/** Every competition with a tournament id, hand-set or trusted: code -> id. */
export async function allSportyBetTournaments(): Promise<Map<string, string>> {
  const { LEAGUES } = await import("@/lib/leagues");
  const out = new Map(await trustedTournaments());
  for (const l of LEAGUES) if (l.ids.sportyBet) out.set(l.code, l.ids.sportyBet);
  return out;
}

/**
 * Stores a discovery. Never overwrites a row an admin decided (a manual row,
 * or a rejection of the same tournament id), and never downgrades a trusted
 * row to pending on a thinner week.
 */
export async function saveDiscovery(leagueCode: string, fixtures: number, found: Discovery): Promise<"saved" | "kept" | "none"> {
  if (!found.best || !found.decision) return "none";
  try {
    const db = await admin();
    const { data: existing } = await db
      .from("sportybet_tournaments")
      .select("tournament_id, status, method")
      .eq("league_code", leagueCode)
      .maybeSingle();
    if (existing) {
      if (existing.method === "manual") return "kept";
      if (existing.status === "rejected" && existing.tournament_id === found.best.tournamentId) return "kept";
      // A thinner week never undoes a clear one: only another clear result
      // replaces a trusted row.
      if (existing.status === "trusted" && found.decision === "pending") return "kept";
    }
    await db.from("sportybet_tournaments").upsert(
      {
        league_code: leagueCode,
        tournament_id: found.best.tournamentId,
        tournament_name: found.best.name,
        category: found.best.category,
        votes: found.best.votes,
        runner_up_votes: found.runnerUp?.votes ?? 0,
        fixtures,
        status: found.decision,
        method: "discovered",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_code" },
    );
    forgetTournaments();
    return "saved";
  } catch {
    return "none";
  }
}

export interface PriceSnapshotRow {
  match_id: string;
  event_id: string;
  captured_at: string;
  kickoff: string;
  prices: CompactPrices;
}

/**
 * Stores price snapshots. Keyed by the board's own read time, so the hourly
 * sync re-reading an unchanged stored board writes nothing new.
 */
export async function savePriceSnapshots(rows: readonly PriceSnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const db = await admin();
    await db.from("sportybet_price_history").upsert(rows as PriceSnapshotRow[], { onConflict: "match_id,captured_at", ignoreDuplicates: true });
  } catch {
    // A lost snapshot is a gap in the record, nothing worse.
  }
}

/** Every snapshot for these fixtures, oldest first, grouped by match id. */
export async function priceSnapshots(matchIds: readonly string[]): Promise<Map<string, Snapshot[]>> {
  const out = new Map<string, Snapshot[]>();
  if (matchIds.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("sportybet_price_history")
      .select("match_id, captured_at, prices")
      .in("match_id", [...new Set(matchIds)])
      .order("captured_at", { ascending: true })
      .limit(5000);
    for (const r of (data ?? []) as { match_id: string; captured_at: string; prices: CompactPrices }[]) {
      const list = out.get(r.match_id) ?? [];
      list.push({ capturedAt: Date.parse(r.captured_at), prices: r.prices });
      out.set(r.match_id, list);
    }
  } catch {
    // No history: picks are logged without prices, as before.
  }
  return out;
}

/** The last snapshot taken before `before` (kick-off for a closing price, now for a live one). */
export async function lastSnapshotBefore(matchId: string, before: number): Promise<Snapshot | null> {
  try {
    const { data } = await (await admin())
      .from("sportybet_price_history")
      .select("captured_at, prices")
      .eq("match_id", matchId)
      .lt("captured_at", new Date(before).toISOString())
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { capturedAt: Date.parse(data.captured_at), prices: data.prices as CompactPrices } : null;
  } catch {
    return null;
  }
}

/** The latest snapshot for each of these fixtures. */
export async function latestSnapshots(matchIds: readonly string[]): Promise<Map<string, Snapshot>> {
  const out = new Map<string, Snapshot>();
  for (const [id, list] of await priceSnapshots(matchIds)) {
    const last = list[list.length - 1];
    if (last) out.set(id, last);
  }
  return out;
}
