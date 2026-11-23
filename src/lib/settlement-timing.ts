/**
 * When a settlement pass may look a game up again, as a pure rule so it is
 * tested without a database (settlement-timing.test.ts).
 *
 * A pick settles as soon as its game's final score is stored (match_results),
 * whatever the age of the row. Only the fresh look-up of a score not yet
 * stored is rationed.
 *
 * A game that is not played on its day is voided (voidReason), as a bookmaker
 * voids a bet on it: the pick was published for that date. Until Nov 2026 such
 * picks stayed open for ever, or settled weeks later on a rearranged game.
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

/** How long after the logged kickoff a game that was not played is voided. */
export const VOID_AFTER_MS = 72 * 3_600_000;
/** A pick with no score and no sign of play this long after kickoff is voided too. */
export const STALE_AFTER_MS = 14 * 86_400_000;

export type VoidReason = "postponed" | "moved" | "stale";

/**
 * Why a pick whose game has no final score should be voided, or null to keep
 * waiting. `stored` is the game's row in match_results, if any. A game seen
 * live or at half time was played, so it is never voided: its score is late,
 * not missing.
 */
export function voidReason(
  loggedKickoff: string,
  stored: { status?: string | null; kickoff?: string | null } | undefined,
  now = Date.now(),
): VoidReason | null {
  const at = Date.parse(loggedKickoff);
  if (!Number.isFinite(at) || now - at < VOID_AFTER_MS) return null;
  const status = stored?.status ?? null;
  if (status === "finished" || status === "live" || status === "halftime") return null;
  if (status === "postponed" || status === "cancelled" || status === "canceled") return "postponed";
  const moved = stored?.kickoff ? Date.parse(stored.kickoff) : NaN;
  if (Number.isFinite(moved) && moved - at > 24 * 3_600_000) return "moved";
  if (now - at >= STALE_AFTER_MS) return "stale";
  return null;
}
