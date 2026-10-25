import { matchesSelection, toSportyBet, toSportyBetBuilder } from "./markets";
import type { RawMarket } from "./sportybet-api";

/**
 * Turning our picks into the selections SportyBet's share code takes.
 *
 * Pure, and checked before a credit is spent: every reason a booking would
 * fail or come back wrong is caught here for free, rather than discovered at
 * two credits a time. Nothing in this file calls anything.
 */

/** One leg: our market id, on a fixture already matched to SportyBet's event. */
export interface BookingLeg {
  market: string;
  eventId: string;
  /** Epoch ms. */
  kickoff: number;
  /**
   * The event's markets as SportyBet lists them. Only needed for a same-game
   * combo that goes on as a Bet Builder, whose pricing call wants each part's
   * odds and probability.
   */
  markets?: readonly RawMarket[];
}

/** book_bet's input, one entry per selection. */
export interface BookSelection {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier?: string;
  /**
   * Set at booking time on every part of a Bet Builder, from SportyBet's
   * pricing call (sportybet-direct.ts priceBetBuilder). Never part of the
   * signature: it is minted afresh for every booking.
   */
  parentBetBuilderMarketId?: string;
}

/** One same-game combo going on as a Bet Builder: its parts, priced as listed. */
export interface BuilderGroup {
  /** The leg it came from, for reporting a refusal against the right pick. */
  index: number;
  eventId: string;
  parts: { selection: BookSelection; odds: string; probability: string }[];
}

export type BookingProblem =
  | { kind: "empty" }
  | { kind: "too-many"; max: number }
  | { kind: "unmapped-market"; index: number; market: string }
  | { kind: "bad-event-id"; index: number; eventId: string }
  | { kind: "started"; index: number }
  | { kind: "duplicate-event"; index: number; eventId: string }
  /** A Bet Builder part SportyBet isn't pricing on this game right now. */
  | { kind: "builder-unavailable"; index: number }
  /** SportyBet's Bet Builder said these parts can't be combined (e.g. home win and draw). */
  | { kind: "builder-refused"; index: number };

export type BookingPlan =
  | { ok: true; selections: BookSelection[]; builders: BuilderGroup[]; signature: string; firstKickoff: number }
  | { ok: false; problems: BookingProblem[] };

/**
 * Most legs on one code. SportyBet books and reads back far longer codes
 * (measured October 2026: 21, 30, 40, 50, 60, 80 and 100 picks all booked and
 * read back whole); 50 covers the longest parlays people actually post while
 * still bounding a malformed request.
 */
export const MAX_LEGS = 50;

/**
 * Legs closer to kickoff than this are refused. A booking takes a few seconds
 * and the user still has to load the code; a game that starts in the
 * meantime is dropped by SportyBet, and the code no longer matches the pick.
 */
export const KICKOFF_MARGIN_MS = 10 * 60_000;

const EVENT_ID = /^sr:match:\d+$/;

/**
 * The selections for a set of legs, or every reason they cannot be booked.
 *
 * Two legs on the same game are refused rather than merged: SportyBet will
 * not combine most markets on one event, and the user should see that before
 * a credit is spent, not after. One leg that is itself a same-game combo
 * goes on as SportyBet's ready-made combo market, or failing that as a Bet
 * Builder: several selections on one event, priced together at booking.
 */
export function planBooking(legs: readonly BookingLeg[], now = Date.now()): BookingPlan {
  const problems: BookingProblem[] = [];
  if (legs.length === 0) return { ok: false, problems: [{ kind: "empty" }] };
  if (legs.length > MAX_LEGS) problems.push({ kind: "too-many", max: MAX_LEGS });

  const seen = new Set<string>();
  const selections: BookSelection[] = [];
  const builders: BuilderGroup[] = [];
  legs.forEach((leg, index) => {
    const mapped = toSportyBet(leg.market);
    const parts = mapped ? null : toSportyBetBuilder(leg.market);
    if (!mapped && !parts) problems.push({ kind: "unmapped-market", index, market: leg.market });
    if (parts) {
      const priced = parts.map((sel) => {
        const outcome = (leg.markets ?? [])
          .find((m) => matchesSelection(m, sel))
          ?.outcomes?.find((o) => String(o.id) === sel.outcomeId);
        const odds = outcome?.odds;
        const probability = outcome?.probability;
        return odds !== undefined && probability !== undefined
          ? {
              selection: { eventId: leg.eventId, marketId: sel.marketId, outcomeId: sel.outcomeId, ...(sel.specifier ? { specifier: sel.specifier } : {}) },
              odds: String(odds),
              probability: String(probability),
            }
          : null;
      });
      if (priced.some((p) => p === null)) {
        problems.push({ kind: "builder-unavailable", index });
      } else {
        const ok = priced as BuilderGroup["parts"];
        builders.push({ index, eventId: leg.eventId, parts: ok });
        selections.push(...ok.map((p) => p.selection));
      }
    }
    if (!EVENT_ID.test(leg.eventId)) problems.push({ kind: "bad-event-id", index, eventId: leg.eventId });
    if (!(leg.kickoff - now > KICKOFF_MARGIN_MS)) problems.push({ kind: "started", index });
    if (seen.has(leg.eventId)) problems.push({ kind: "duplicate-event", index, eventId: leg.eventId });
    seen.add(leg.eventId);
    if (mapped) {
      selections.push({
        eventId: leg.eventId,
        marketId: mapped.marketId,
        outcomeId: mapped.outcomeId,
        ...(mapped.specifier ? { specifier: mapped.specifier } : {}),
      });
    }
  });

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    selections,
    builders,
    signature: selectionSignature(selections),
    firstKickoff: Math.min(...legs.map((l) => l.kickoff)),
  };
}

/**
 * A stable key for a set of selections, whatever order they came in.
 *
 * Two users building the same slip get the same signature, so the second one
 * gets the first one's code from the cache instead of a new call.
 */
export function selectionSignature(selections: readonly BookSelection[]): string {
  return selections
    .map((s) => [s.eventId, s.marketId, s.outcomeId, s.specifier ?? ""].join("|"))
    .sort()
    .join(";");
}

/** A booking as book_bet returns it, reduced to what the app keeps. */
export interface BookedCode {
  bookingCode: string;
  shareUrl: string | null;
  /** Epoch ms after which the code stops working. */
  deadline: number;
  selectionsCount: number;
}

/**
 * Reads book_bet's response, or null when it is not a usable booking.
 *
 * Refuses a booking that came back with fewer selections than were sent:
 * SportyBet drops a selection it will not take rather than failing the whole
 * booking, and a code that silently lost a leg is not the slip the user
 * built.
 */
export function readBooking(raw: unknown, sent: number): BookedCode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.booking_code === "string" ? r.booking_code.trim() : "";
  if (!/^[A-Z0-9]{4,12}$/i.test(code)) return null;
  const deadline = Number(r.deadline);
  if (!Number.isFinite(deadline) || deadline <= 0) return null;
  const count = Number(r.selections_count ?? (Array.isArray(r.outcomes) ? r.outcomes.length : NaN));
  if (count !== sent) return null;
  return {
    bookingCode: code.toUpperCase(),
    shareUrl: typeof r.share_url === "string" ? r.share_url : null,
    deadline,
    selectionsCount: count,
  };
}
