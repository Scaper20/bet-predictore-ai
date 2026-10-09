/**
 * Slip tracker — follows a saved slip through kickoff, live play and the
 * final whistle, leg by leg.
 *
 * Pure: no storage and no fetching, so both the tracker UI and its tests
 * share one definition of what "on track", "won" and "lost" mean.
 */

import { evaluatePick, type PickResult } from "@/lib/settlement";
import type { MatchStatus } from "@/lib/types";

/** One leg as it was when the slip was saved. Nothing here changes later. */
export interface TrackedLeg {
  matchId: string;
  fixture: string;
  homeName: string;
  awayName: string;
  league: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
}

/** What the live/results feed says about a leg's match right now. */
export interface LegScore {
  status: MatchStatus;
  minute?: number | null;
  home: number | null;
  away: number | null;
  /** Set by the polling browser, never the API: when this minute was first
   * seen (epoch ms), for the live clock to count on from (lib/live-clock.ts). */
  observedAt?: number;
}

/** A finished leg, remembered on the device so it never has to be looked up again. */
export interface LegResult {
  home: number;
  away: number;
  /** "void" for a push, a postponement or a cancellation. */
  grade: "win" | "lose" | "void";
  /** Set when the match was never played out, rather than finishing level on the line. */
  abandoned?: "postponed" | "cancelled";
}

export type LegState =
  | { kind: "pending" }
  | { kind: "live"; score: LegScore; onTrack: boolean | null }
  | { kind: "settled"; result: LegResult }
  /** Kicked off but the feed has nothing yet — shown as pending, never guessed. */
  | { kind: "unknown" };

export type SlipStatus = "pending" | "live" | "won" | "lost" | "void";

/**
 * Asian handicap, which the shared settlement grader deliberately leaves out
 * (it never reaches predictions_log) but a user can still put on a slip.
 * Quarter lines split the stake across the two neighbouring half-lines; a
 * half that pushes leaves the other half to decide.
 */
function gradeHandicap(side: "home" | "away", line: number, home: number, away: number): PickResult {
  const quarter = Math.abs((line * 4) % 2) === 1;
  if (quarter) {
    const a = gradeHandicap(side, line - 0.25, home, away);
    const b = gradeHandicap(side, line + 0.25, home, away);
    if (a === b) return a;
    return a === "push" ? b : b === "push" ? a : "push";
  }
  const margin = (side === "home" ? home - away : away - home) + line;
  return margin > 0 ? "win" : margin < 0 ? "lose" : "push";
}

/** Grades a market against a score — final, or the current one for a live game. */
/** Same-game combos from Forge are stored as "combo:<market>+<market>…". */
export const COMBO_PREFIX = "combo:";

export function gradeMarket(market: string, home: number, away: number): PickResult | null {
  // A combo wins only if every part wins; any loss loses it. A part that
  // pushes drops out, the way a bookmaker settles a void leg in a bet builder.
  if (market.startsWith(COMBO_PREFIX)) {
    const parts = market.slice(COMBO_PREFIX.length).split("+");
    if (parts.length < 2) return null;
    const grades = parts.map((m) => gradeMarket(m, home, away));
    if (grades.some((g) => g === null)) return null;
    if (grades.includes("lose")) return "lose";
    return grades.includes("win") ? "win" : "push";
  }
  const ah = market.match(/^ah:(home|away):(-?\d+(?:\.\d+)?)$/);
  if (ah) return gradeHandicap(ah[1] as "home" | "away", Number(ah[2]), home, away);
  return evaluatePick(market, home, away);
}

/** Turns a finished (or abandoned) match into the result stored on the leg. */
export function settleLeg(leg: TrackedLeg, score: LegScore): LegResult | null {
  if (score.status === "postponed" || score.status === "cancelled") {
    return { home: score.home ?? 0, away: score.away ?? 0, grade: "void", abandoned: score.status };
  }
  if (score.status !== "finished" || score.home === null || score.away === null) return null;
  const grade = gradeMarket(leg.market, score.home, score.away);
  if (!grade) return null;
  return { home: score.home, away: score.away, grade: grade === "push" ? "void" : grade };
}

export function legState(
  leg: TrackedLeg,
  result: LegResult | undefined,
  score: LegScore | undefined,
  now = Date.now(),
): LegState {
  if (result) return { kind: "settled", result };
  if (score && (score.status === "live" || score.status === "halftime")) {
    const grade =
      score.home !== null && score.away !== null ? gradeMarket(leg.market, score.home, score.away) : null;
    return { kind: "live", score, onTrack: grade === null ? null : grade !== "lose" };
  }
  if (Date.parse(leg.kickoff) > now) return { kind: "pending" };
  return { kind: "unknown" };
}

/**
 * The slip as a whole. Lost the moment any leg loses, won only once every
 * leg is in (voids drop out, the way bookmakers settle an accumulator), live
 * while anything is being played.
 */
export function slipStatus(states: LegState[]): SlipStatus {
  const settled = states.flatMap((s) => (s.kind === "settled" ? [s.result.grade] : []));
  if (settled.includes("lose")) return "lost";
  if (settled.length === states.length) return settled.includes("win") ? "won" : "void";
  if (states.some((s) => s.kind === "live")) return "live";
  if (settled.length > 0 || states.some((s) => s.kind === "unknown")) return "live";
  return "pending";
}

/** Legs still worth asking the feed about: kicked off and not yet settled. */
export function legsToPoll(legs: TrackedLeg[], results: Record<string, LegResult>, now = Date.now()) {
  return legs.filter((l) => !results[l.matchId] && Date.parse(l.kickoff) <= now);
}

/** Product of the legs' probabilities — the "combined chance" the slip was saved at. */
export function combinedProbability(legs: TrackedLeg[]): number {
  return legs.reduce((p, l) => p * l.probability, 1);
}

/** Identifies a set of selections, so saving the same slip twice is a no-op. */
export function slipSignature(legs: { matchId: string; market: string }[]): string {
  return legs
    .map((l) => `${l.matchId}|${l.market}`)
    .sort()
    .join(",");
}
