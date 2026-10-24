/**
 * Community codes, the pure part: how a posted code is ranked, graded and
 * counted into its poster's record. code-hub-posts.ts does the reading and
 * writing.
 */
import { evaluatePick, type PickResult } from "@/lib/settlement";
import { gradeLegFull } from "@/lib/leg-pricing";
import { isRawMarket } from "@/lib/odds/markets";
import { proLeagueLocked, type Viewer } from "@/lib/access";
import type { ScoredGame } from "@/lib/code-scan-core";

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

/**
 * One game's pick, or same-game combo, against the final score; a market
 * kept as SportyBet addresses it ("raw:", markets.ts) as SportyBet settles
 * it, with the half-time score when it is settled on the halves.
 */
export function gradeGame(market: string, home: number, away: number, ht?: { home: number; away: number } | null): PickResult | null {
  if (isRawMarket(market)) {
    const g = gradeLegFull(market, { home, away }, ht);
    return g === "win" || g === "lose" || g === "push" ? g : null;
  }
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
export function gradeCode(
  games: readonly PostedGame[],
  scores: ReadonlyMap<string, { home: number; away: number; ht?: { home: number; away: number } | null }>,
): "won" | "lost" | "void" | null {
  const results: (PickResult | null)[] = games.map((g) => {
    const s = g.matchId ? scores.get(g.matchId) : undefined;
    return s && g.market ? gradeGame(g.market, s.home, s.away, s.ht) : null;
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

export interface PostGame {
  matchId: string | null;
  /** Our league code, for the Pro lock when the post is shown (absent on posts before it was kept). */
  leagueCode?: string | null;
  market: string | null;
  label: string;
  homeName: string | null;
  awayName: string | null;
  kickoff: number | null;
  probability: number | null;
  verdict: ScoredGame["verdict"];
  /** Where the chance came from, when it isn't our model's (absent on older posts). */
  source?: ScoredGame["source"];
}

export interface CommunityPost {
  id: number;
  code: string;
  authorName: string;
  record: PosterRecord;
  postedAt: string;
  games: PostGame[];
  readable: number;
  odds: number | null;
  chance: number | null;
  fairness: number | null;
  score: number;
  firstKickoff: string;
  lastKickoff: string;
  status: "live" | "settled" | "removed";
  result: "won" | "lost" | "void" | null;
}

/**
 * A poster's public name: their profile name, else "Member" and a short tag
 * from their account id. Never any part of their email, which is private.
 * The tag only tells two nameless posters apart; it is not a secret.
 */
export function posterName(displayName: string | null, userId: string): string {
  const name = displayName?.trim().replace(/\s+/g, " ");
  if (name) return name.slice(0, 24);
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 0x01000193);
  return `Member ${(h >>> 0).toString(16).slice(-4).toUpperCase().padStart(4, "0")}`;
}

/**
 * A post as this viewer may see it: games still Pro-only for them lose the
 * model's chance, and the code's chance goes with them (the same rule as the
 * editor, code-scan-core.ts lockGames).
 */
export function postForViewer(post: CommunityPost, viewer: Viewer, now = Date.now()): CommunityPost {
  if (viewer.paid) return post;
  let hidden = false;
  const games = post.games.map((g) => {
    const locked =
      g.probability !== null &&
      !!g.matchId &&
      g.kickoff !== null &&
      proLeagueLocked({ id: g.matchId, kickoff: new Date(g.kickoff).toISOString(), league: { code: g.leagueCode } }, viewer, now);
    if (!locked) return g;
    hidden = true;
    return { ...g, probability: null, verdict: "locked" as const };
  });
  return hidden ? { ...post, games, chance: null } : post;
}
