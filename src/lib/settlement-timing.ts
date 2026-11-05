/**
 * When a settlement pass may look a game up again, as a pure rule so it is
 * tested without a database (settlement-timing.test.ts).
 *
 * A pick settles as soon as its game's final score is stored (match_results),
 * whatever the age of the row: a postponed game keeps the kickoff it was
 * logged with, so the age of the row says nothing about when it was played.
 * Only the fresh look-up of a score not yet stored is rationed.
 */
export interface SettleOpts {
  /** Only look up scores for rows kicked off this recently; the daily sweep leaves it out and looks up all. */
  maxAgeHours?: number;
  /** Don't look a game up before this long after kickoff: it cannot be over. */
  refetchAfterMinutes?: number;
  /** At most this many look-ups in one pass. */
  maxRefetch?: number;
  /** Grade corners and shots from ESPN's counts in this pass, not only in the daily sweep. */
  withStats?: boolean;
}

export type SettleStep = "grade" | "refetch" | "skip";

export function settleStep(i: { cachedFinished: boolean; ageMs: number; refetchesLeft: number }, o: SettleOpts): SettleStep {
  if (i.cachedFinished) return "grade";
  if (o.maxAgeHours !== undefined && i.ageMs > o.maxAgeHours * 3_600_000) return "skip";
  if (o.refetchAfterMinutes !== undefined && i.ageMs < o.refetchAfterMinutes * 60_000) return "skip";
  if (i.refetchesLeft <= 0) return "skip";
  return "refetch";
}
