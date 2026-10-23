import { after, NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";
import { leagueByProviderName } from "@/lib/leagues";
import { checkAdmin } from "@/lib/admin";
import { ALLOWANCE_WINDOW_MS, allowanceState, weeklyCodeAllowance } from "@/lib/code-hub-plans";
import { bookingAvailable, bookingCodeFor, peekBookingCode } from "@/lib/odds/booking-code";
import { KICKOFF_MARGIN_MS, MAX_LEGS, type BookingLeg, type BookingProblem } from "@/lib/odds/booking";
import { offeredOn, toSportyBet } from "@/lib/odds/markets";
import { findOnBoard } from "@/lib/odds/sportybet";
import { shareLink } from "@/lib/odds/sportybet-api";
import { codesGivenTo, logBooking, sportyBetTournament, type BookingLogEntry } from "@/lib/odds/sportybet-links";

/**
 * A SportyBet booking code for the user's combo.
 *
 * Every leg must be found on SportyBet's board, under a market SportyBet
 * books, before anything is booked. A code is a promise that what the user
 * loads on SportyBet is the combo they built here, so a leg that cannot be
 * booked is reported back by name, never quietly dropped, and the user
 * decides whether to remove it and try again.
 *
 * A member's own codes are a paid perk: Pro and VIP get a weekly allowance
 * (code-hub-plans.ts), counted from the booking log; free and day-pass users
 * are pointed to the plans. A code the member already holds for the same
 * picks is handed back without using a slot. Admins are not limited, so the
 * feature can be checked on any account.
 *
 * Booking is free on the direct path and codes are cached by selection
 * (booking-code.ts), so the per-minute limit below is about fairness to
 * SportyBet, not about cost.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Per user and per instance: a few attempts a minute is plenty for a human. */
const PER_MINUTE = 6;
const recent = new Map<string, number[]>();

function allowed(userId: string): boolean {
  const now = Date.now();
  const stamps = (recent.get(userId) ?? []).filter((t) => t > now - 60_000);
  if (stamps.length >= PER_MINUTE) return false;
  stamps.push(now);
  recent.set(userId, stamps);
  if (recent.size > 5_000) recent.clear();
  return true;
}

type LegProblem =
  | "unsupported-market"
  | "same-game-combo"
  | "unsupported-competition"
  | "not-listed"
  | "starting"
  | "not-offered"
  | "duplicate-game";

interface IncomingLeg {
  matchId?: unknown;
  homeName?: unknown;
  awayName?: unknown;
  kickoff?: unknown;
  league?: unknown;
  market?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function fromPlan(problem: BookingProblem): LegProblem | null {
  switch (problem.kind) {
    case "unmapped-market":
      return "unsupported-market";
    case "started":
      return "starting";
    case "duplicate-event":
      return "duplicate-game";
    case "bad-event-id":
      return "not-listed";
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const entitlement = await getEntitlement();
  if (!entitlement.signedIn || !entitlement.userId) {
    return NextResponse.json({ error: "Sign in to get a SportyBet code.", locked: true }, { status: 403, headers: NO_STORE });
  }
  if (!allowed(entitlement.userId)) {
    return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429, headers: NO_STORE });
  }

  const unlimited = (await checkAdmin()).ok;
  if (!unlimited && weeklyCodeAllowance(entitlement.tier) === 0) {
    return NextResponse.json(
      { error: "SportyBet codes for your own combos come with Pro and VIP.", upgrade: true },
      { status: 402, headers: NO_STORE },
    );
  }

  const body = (await request.json().catch(() => null)) as { legs?: IncomingLeg[] } | null;
  const incoming = Array.isArray(body?.legs) ? body.legs : [];
  if (incoming.length === 0 || incoming.length > MAX_LEGS) {
    return NextResponse.json(
      { error: incoming.length ? `A code holds at most ${MAX_LEGS} picks.` : "Your combo is empty." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!(await bookingAvailable())) {
    const userId = entitlement.userId;
    after(() => logBooking({ source: "slip", userId, legs: incoming.length, outcome: "unavailable" }));
    return NextResponse.json({ error: "SportyBet codes are paused for now. Try again later." }, { status: 503, headers: NO_STORE });
  }

  const started = Date.now();
  const userId = entitlement.userId;
  // Every attempt is logged for /admin/sportybet, after the response.
  const log = (entry: Omit<BookingLogEntry, "source" | "userId" | "legs" | "durationMs">) =>
    after(() =>
      logBooking({ ...entry, source: "slip", userId, legs: incoming.length, durationMs: Date.now() - started }),
    );

  const problems: { matchId: string; problem: LegProblem }[] = [];
  const legs: BookingLeg[] = [];
  const matchIds: string[] = [];

  await Promise.all(
    incoming.map(async (raw, index) => {
      const matchId = str(raw.matchId) ?? `leg-${index}`;
      const homeName = str(raw.homeName);
      const awayName = str(raw.awayName);
      const market = str(raw.market);
      const kickoff = Date.parse(str(raw.kickoff) ?? "");
      if (!homeName || !awayName || !market || !Number.isFinite(kickoff)) {
        problems.push({ matchId, problem: "not-listed" });
        return;
      }
      // A same-game combo ("combo:a+b") goes on as SportyBet's ready-made
      // combo market when one exists (markets.ts toSportyBetCombo); the rest
      // (three parts, a handicap part) say so rather than "unsupported".
      const selection = toSportyBet(market);
      if (!selection) {
        problems.push({ matchId, problem: market.startsWith("combo:") ? "same-game-combo" : "unsupported-market" });
        return;
      }
      if (kickoff - Date.now() <= KICKOFF_MARGIN_MS) {
        problems.push({ matchId, problem: "starting" });
        return;
      }
      const league = leagueByProviderName(str(raw.league) ?? "");
      if (!league || !(await sportyBetTournament(league.code))) {
        problems.push({ matchId, problem: "unsupported-competition" });
        return;
      }
      const event = await findOnBoard(
        { homeName, awayName, kickoff },
        { leagueCode: league.code, matchId: str(raw.matchId) ?? undefined },
      ).catch(() => null);
      if (!event) {
        problems.push({ matchId, problem: "not-listed" });
        return;
      }
      // Lines differ by game: refuse a selection SportyBet isn't offering on
      // this one now, rather than have the whole code refused. A board with
      // no markets at all (an old parse.bot copy) can't say, so it is let through.
      if (event.markets.length > 0 && !offeredOn(selection, event.markets)) {
        problems.push({ matchId, problem: "not-offered" });
        return;
      }
      legs[index] = { market, eventId: event.eventId, kickoff: event.kickoff };
      matchIds[index] = matchId;
    }),
  );

  if (problems.length > 0) {
    log({ outcome: "problems", problems });
    return NextResponse.json({ ok: false, problems }, { headers: NO_STORE });
  }

  // The allowance: checked once every pick is known to be bookable, so a combo
  // that can't go on a code never costs a slot.
  let remaining: number | null = null;
  let given: Map<string, number> | null = null;
  if (!unlimited) {
    given = await codesGivenTo(userId, Date.now() - ALLOWANCE_WINDOW_MS);
    if (!given) {
      return NextResponse.json({ error: "Couldn't check your weekly codes just now. Try again shortly." }, { status: 503, headers: NO_STORE });
    }
    const state = allowanceState(entitlement.tier, [...given.values()]);
    const held = await peekBookingCode(legs);
    if (state.remaining === 0 && !(held && given.has(held))) {
      return NextResponse.json(
        {
          error: `You've used your ${state.allowance} SportyBet codes for this week.`,
          limit: true,
          nextFreeAt: state.nextFreeAt,
          upgrade: entitlement.tier !== "vip",
        },
        { status: 402, headers: NO_STORE },
      );
    }
    remaining = state.remaining;
  }

  const booked = await bookingCodeFor(legs);
  if (booked.ok) {
    if (given && remaining !== null && !given.has(booked.bookingCode)) remaining = Math.max(0, remaining - 1);
    log({
      outcome: booked.cached ? "cached" : "booked",
      via: booked.via === "cache" ? null : booked.via,
      code: booked.bookingCode,
      readBack: booked.readBack,
    });
    return NextResponse.json(
      {
        ok: true,
        code: booked.bookingCode,
        url: shareLink(booked.bookingCode),
        deadline: booked.deadline,
        legs: booked.selectionsCount,
        /** Codes left in the member's rolling week; null when unlimited. */
        remaining,
      },
      { headers: NO_STORE },
    );
  }
  if (booked.reason === "invalid") {
    const planProblems = booked.problems.flatMap((p) => {
      const problem = fromPlan(p);
      return problem && "index" in p ? [{ matchId: matchIds[p.index], problem }] : [];
    });
    log({ outcome: "problems", problems: planProblems });
    return NextResponse.json({ ok: false, problems: planProblems }, { headers: NO_STORE });
  }
  log({ outcome: "refused" });
  return NextResponse.json(
    { error: "SportyBet didn't accept that combo just now. A market may have closed; try again shortly." },
    { status: 502, headers: NO_STORE },
  );
}
