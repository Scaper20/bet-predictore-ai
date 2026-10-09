import type { MatchStatus } from "@/lib/types";

/**
 * How far a live clock may run on its own past the last minute the feed
 * reported. The feeds report every minute or so; if one goes quiet for longer
 * than this, holding the minute is more honest than inventing more of it.
 */
export const MAX_DRIFT_MINUTES = 10;

/**
 * The match minute now, projected from the last one a feed reported.
 *
 * A feed's minute is a snapshot: by the time a cached page or a 30-second poll
 * shows it, the game has moved on. Counting forward from when it was observed
 * keeps every clock on the site agreeing with real time. It never runs past
 * the end of the half it was observed in (the feed has to say the second half
 * has started) and doesn't project stoppage or extra time, which have no fixed
 * length.
 */
export function tickedMinute(
  minute: number | null | undefined,
  status: MatchStatus,
  observedAt: number,
  now: number,
): number | null {
  if (minute == null) return null;
  if (status !== "live" || !Number.isFinite(observedAt) || minute > 90) return minute;
  const elapsed = Math.floor((now - observedAt) / 60_000);
  if (elapsed <= 0) return minute;
  const endOfHalf = minute <= 45 ? 45 : 90;
  return Math.max(minute, Math.min(minute + Math.min(elapsed, MAX_DRIFT_MINUTES), endOfHalf));
}

/** The most a fresh reading may sit below what's on screen and still be held. */
export const MAX_HOLD_MINUTES = 2;

/**
 * What to show, given what's on screen and the new projection.
 *
 * A feed's minute usually trails its own timestamp by up to a minute, so a
 * fresh reading can project a minute behind the clock that was counting on
 * from the last one. Stepping 58' back to 57' looks broken, so a small dip is
 * held until real time catches up; a larger one is the feed correcting us and
 * wins.
 */
export function steadyMinute(shown: number | null, projected: number | null): number | null {
  if (shown == null || projected == null) return projected;
  return projected < shown && shown - projected <= MAX_HOLD_MINUTES ? shown : projected;
}

/** A feed's minute and when it was read. */
export interface Reading {
  status: MatchStatus;
  minute: number | null;
  observedAt: number;
}

/**
 * Stamp a new reading with when its minute was first seen.
 *
 * Polls come every 30 seconds and the feeds move about once a minute, so most
 * polls repeat the minute already on screen. Stamping each repeat with the
 * poll's own time would restart the count every 30 seconds and the clock
 * could never move on its own; keeping the first sighting lets it.
 */
export function rebase<T extends Reading>(prev: Reading | null | undefined, next: T): T {
  return prev && prev.status === next.status && prev.minute === next.minute ? { ...next, observedAt: prev.observedAt } : next;
}

/**
 * A poll's answers by match id, each stamped with when its minute was first
 * seen, given the answers already on screen. For the lookups that return a
 * batch of games at once (/api/slip/status).
 */
export function stampAll<T extends { status: MatchStatus; minute?: number | null; observedAt?: number }>(
  prev: Record<string, T>,
  next: Record<string, T>,
  at: number,
): Record<string, T & { observedAt: number }> {
  const out: Record<string, T & { observedAt: number }> = {};
  for (const [id, n] of Object.entries(next)) {
    const p = prev[id];
    const before = p?.observedAt != null ? { status: p.status, minute: p.minute ?? null, observedAt: p.observedAt } : null;
    const { observedAt } = rebase(before, { status: n.status, minute: n.minute ?? null, observedAt: at });
    out[id] = { ...n, observedAt };
  }
  return out;
}
