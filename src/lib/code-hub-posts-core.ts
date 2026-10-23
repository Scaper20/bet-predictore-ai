/**
 * Community codes, the pure part: how a posted code is ranked, graded and
 * counted into its poster's record. code-hub-posts.ts does the reading and
 * writing.
 */
import { evaluatePick, type PickResult } from "@/lib/settlement";

/** Below this chance a code sinks to the bottom, however well it is priced. */
export const LONGSHOT_CHANCE = 0.03;

/** How many codes one member may post a day. */
export const POSTS_PER_DAY = 3;

/**
 * A code's place in the list: its fairness (chance × SportyBet odds, so 1 is
 * a fair price) weighted by its chance, so a well-priced 40% code beats a
 * well-priced 4% one. Longshots and codes we can't fully read go last.
 */
export function rankScore(chance: number | null, fairness: number | null): number {
  if (chance === null || fairness === null) return 0;
  if (chance < LONGSHOT_CHANCE) return Math.round(chance * 1_000) / 1_000_000;
  return Math.round(fairness * Math.sqrt(chance) * 10_000) / 10_000;
}

export interface RankedPost {
  score: number;
  chance: number | null;
  postedAt: string;
}

/** Best first; ties to the likelier code, then the earlier post. */
export function byRank<T extends RankedPost>(a: T, b: T): number {
  return b.score - a.score || (b.chance ?? 0) - (a.chance ?? 0) || a.postedAt.localeCompare(b.postedAt);
}

/** One game's pick, or same-game combo, against the final score. */
export function gradeGame(market: string, home: number, away: number): PickResult | null {
  if (!market.startsWith("combo:")) return evaluatePick(market, home, away);
  const parts = market.slice("combo:".length).split("+").map((m) => evaluatePick(m, home, away));
  if (parts.some((p) => p === null)) return null;
  if (parts.includes("lose")) return "lose";
  return parts.every((p) => p === "push") ? "push" : "win";
}

export interface PostedGame {
  matchId: string | null;
  market: string | null;
}

/**
 * The whole code against the scores we have: lost as soon as any game loses;
 * won once every game is in and none lost (a push just drops out, as
 * SportyBet settles it); void when every game pushed. Null while waiting, or
 * when a game can't be graded by us (it then never settles here and the
 * post simply stays without a result).
 */
export function gradeCode(games: readonly PostedGame[], scores: ReadonlyMap<string, { home: number; away: number }>): "won" | "lost" | "void" | null {
  const results: (PickResult | null)[] = games.map((g) => {
    const s = g.matchId ? scores.get(g.matchId) : undefined;
    return s && g.market ? gradeGame(g.market, s.home, s.away) : null;
  });
  if (results.includes("lose")) return "lost";
  if (results.some((r) => r === null)) return null;
  return results.every((r) => r === "push") ? "void" : "won";
}

export interface PosterRecord {
  landed: number;
  missed: number;
}

/** A poster's record from their settled posts. */
export function recordOf(results: readonly (string | null)[]): PosterRecord {
  return {
    landed: results.filter((r) => r === "won").length,
    missed: results.filter((r) => r === "lost").length,
  };
}
