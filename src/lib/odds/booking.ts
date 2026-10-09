import { toSportyBet } from "./markets";
import type { FixtureLike } from "./match-fixture";

/**
 * Turning a slip into a SportyBet booking: the pure half.
 *
 * Kept free of fetch and env so the part that can go wrong silently -- which
 * leg becomes which selection, and which legs are refused -- is tested without
 * a network. A booking code is a promise that "this slip, as shown, is what you
 * will find on SportyBet", so every leg that cannot be addressed with
 * confidence is dropped AND reported, never approximated.
 */

/** A leg, reduced to what booking needs. */
export interface BookableLeg {
  matchId: string;
  homeName: string;
  awayName: string;
  /** Epoch milliseconds. */
  kickoff: number;
  /** BetriX market id, e.g. "ou:over:2.5". */
  market: string;
}

/** One selection in book_bet's own shape. */
export interface BookingSelection {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier?: string;
}

export type SkipReason =
  /** The market has no SportyBet address we are confident about. */
  | "unsupported-market"
  /** No unambiguous SportyBet fixture for these clubs and this kickoff. */
  | "not-listed"
  /** SportyBet accepted the request but would not book this selection. */
  | "unavailable";

export interface SkippedLeg {
  matchId: string;
  reason: SkipReason;
}

export interface BookingPlan {
  selections: BookingSelection[];
  /** matchId for each entry of `selections`, in the same order. */
  matchIds: string[];
  skipped: SkippedLeg[];
}

/** A fixture on SportyBet's listing, with the id book_bet wants. */
export interface ListedEvent extends FixtureLike {
  eventId: string;
}

/**
 * Decide what to book.
 *
 * `eventIds` maps a leg's matchId to the SportyBet event it was matched to; a
 * leg missing from it was not found. One selection per match, first wins: the
 * slip already enforces that, but this runs on a payload the browser sent.
 */
export function planBooking(legs: BookableLeg[], eventIds: Map<string, string>): BookingPlan {
  const selections: BookingSelection[] = [];
  const matchIds: string[] = [];
  const skipped: SkippedLeg[] = [];
  const seen = new Set<string>();

  for (const leg of legs) {
    if (seen.has(leg.matchId)) continue;
    seen.add(leg.matchId);

    const address = toSportyBet(leg.market);
    if (!address) {
      skipped.push({ matchId: leg.matchId, reason: "unsupported-market" });
      continue;
    }

    const eventId = eventIds.get(leg.matchId);
    if (!eventId) {
      skipped.push({ matchId: leg.matchId, reason: "not-listed" });
      continue;
    }

    selections.push({ eventId, ...address });
    matchIds.push(leg.matchId);
  }

  return { selections, matchIds, skipped };
}

/**
 * Kickoff as epoch milliseconds, whatever form the listing used.
 *
 * Accepts milliseconds, seconds, a numeric string or an ISO date. A value that
 * is none of those yields null and the event is dropped: a fixture without a
 * trustworthy kickoff cannot be matched, and matching on teams alone is how a
 * reverse fixture gets booked.
 */
export function parseKickoff(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e11 ? raw * 1000 : raw;
  }
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseKickoff(Number(trimmed));
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? at : null;
}

/** Reads the listing from a get_prematch_football_events response. */
export function parseListing(body: unknown): ListedEvent[] {
  const root = body as { data?: unknown } | null;
  const payload = (root && typeof root === "object" && "data" in root ? root.data : body) as {
    events?: unknown;
  } | null;
  const events = Array.isArray(payload?.events) ? payload.events : [];

  const out: ListedEvent[] = [];
  for (const raw of events) {
    const e = raw as Record<string, unknown> | null;
    if (!e) continue;
    const eventId = e.eventId;
    const homeName = e.homeTeamName;
    const awayName = e.awayTeamName;
    const kickoff = parseKickoff(e.kickoffTime);
    if (typeof eventId !== "string" || !eventId) continue;
    if (typeof homeName !== "string" || typeof awayName !== "string") continue;
    if (kickoff === null) continue;
    out.push({ eventId, homeName, awayName, kickoff });
  }
  return out;
}

/** What a successful book_bet response carries. */
export interface BookingResult {
  code: string;
  url: string | null;
  /** Epoch milliseconds after which the code no longer loads. */
  deadline: number | null;
  /** eventIds SportyBet declined to book (suspended market and the like). */
  unavailableEventIds: string[];
}

/**
 * Reads a book_bet response, or null when it carries no code.
 *
 * A response without a share code is a failure however it is dressed, and the
 * caller must not show the user something that looks like a code.
 */
export function parseBookingResponse(body: unknown): BookingResult | null {
  const root = body as { data?: unknown } | null;
  const payload = (root && typeof root === "object" && "data" in root && root.data
    ? root.data
    : body) as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") return null;

  const code = payload.shareCode;
  if (typeof code !== "string" || !/^[A-Za-z0-9]{4,20}$/.test(code)) return null;

  const unavailable = Array.isArray(payload.unavailableOutcomes) ? payload.unavailableOutcomes : [];
  const unavailableEventIds = unavailable.flatMap((u) => {
    const id = (u as { eventId?: unknown } | null)?.eventId;
    return typeof id === "string" ? [id] : [];
  });

  return {
    code: code.toUpperCase(),
    url: typeof payload.shareURL === "string" ? payload.shareURL : null,
    deadline: typeof payload.deadline === "number" ? payload.deadline : null,
    unavailableEventIds,
  };
}
