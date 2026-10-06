import type { Match } from "@/lib/types";

/**
 * Longest a game can really be in play: 90 minutes, half-time, stoppage,
 * extra time, penalties and a long delay, with room to spare.
 *
 * Feeds sometimes never send full time. TheSportsDB kept Panama v New
 * Zealand (1 Oct 2026) "live" in its livescore feed for days. Past this,
 * a game marked live or half-time is treated as finished on the last
 * score the feed gave. The same cutoff is enforced in the live-scores edge
 * function and the Python ingester.
 */
export const MAX_IN_PLAY_MS = 4 * 60 * 60 * 1000;

export function isStaleInPlay(status: Match["status"], kickoff: string | number, now = Date.now()): boolean {
  const k = typeof kickoff === "number" ? kickoff : Date.parse(kickoff);
  return (status === "live" || status === "halftime") && Number.isFinite(k) && now - k > MAX_IN_PLAY_MS;
}

/** The match as it should be shown: a stuck "live" past the cutoff reads as finished. */
export function settleStale<M extends Pick<Match, "status" | "kickoff" | "minute">>(m: M, now = Date.now()): M {
  return isStaleInPlay(m.status, m.kickoff, now) ? { ...m, status: "finished", minute: null } : m;
}
