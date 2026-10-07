import type { Prediction } from "@/lib/model/predict";
import { isStrong } from "@/lib/model/tiers";
import { stature } from "@/lib/featured";
import { isFreeMarket } from "@/lib/access";

/**
 * Today's free picks: the matches whose headline pick a free viewer sees in
 * full, whatever its market.
 *
 * One Strong pick (the most confident), two hot games (the ones people most
 * want to bet on) and three more of the model's best reads. Chosen once a
 * day for everyone and stored (0046_free_daily_picks.sql), so every page,
 * every server and every visitor agrees, and a free pick stays open after
 * kickoff and through its result.
 *
 * Only the Strong slot carries a Strong pick: the other five are drawn from
 * standard picks so free viewers get exactly one Strong pick a day. Matches
 * whose pick is already open on the free plan (a 1X2 pick) are skipped while
 * there are enough others, so each slot opens something new.
 */

export const HOT_SLOTS = 2;
export const NORMAL_SLOTS = 3;

export interface FreePicks {
  /** The Lagos calendar day the set belongs to (YYYY-MM-DD). */
  day: string;
  strong: string | null;
  hot: string[];
  normal: string[];
}

export function freeIds(set: FreePicks | null): string[] {
  if (!set) return [];
  return [...(set.strong ? [set.strong] : []), ...set.hot, ...set.normal];
}

export type FreeSlot = "strong" | "hot" | "normal";

export function freeSlot(set: FreePicks | null, matchId: string): FreeSlot | null {
  if (!set) return null;
  if (set.strong === matchId) return "strong";
  if (set.hot.includes(matchId)) return "hot";
  if (set.normal.includes(matchId)) return "normal";
  return null;
}

/** A team's overall strength on the model's log scale (0 = league average). */
function strength(r: { attack: number; defence: number } | null): number {
  return r ? r.attack + r.defence : 0;
}

const squash = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * 0-1: how much a match is the kind people want to bet on.
 *
 * - Competition (45%): a Premier League or Champions League tie draws far
 *   more money than a second-tier one.
 * - Big clubs (30%): the stronger side counts most (a top club's game is hot
 *   whoever it plays), the weaker side less (a top-two clash is hotter still).
 * - Our own users (15%): loves and comments on the pick.
 * - A contest (10%): an even game gets more attention than a foregone one.
 */
export function hotness(p: Prediction, social = 0): number {
  const comp = stature(p.league?.code ?? p.match.league.code);
  const a = strength(p.ratings.home);
  const b = strength(p.ratings.away);
  const big = 0.6 * squash(3 * Math.max(a, b)) + 0.4 * squash(3 * Math.min(a, b));
  const buzz = Math.min(1, Math.log1p(Math.max(0, social)) / Math.log1p(20));
  const contest = 1 - Math.abs(p.markets.home - p.markets.away);
  return 0.45 * comp + 0.3 * big + 0.15 * buzz + 0.1 * contest;
}

/**
 * Picks the day's set from the fixtures still to kick off. `social` counts
 * loves and comments by match id.
 */
export function selectFreePicks(
  day: string,
  predictions: Prediction[],
  social: Map<string, number> = new Map(),
): FreePicks {
  const usable = predictions.filter((p) => p.sufficiency.publishable && p.topPick);
  const confidence = (p: Prediction) => p.topPick?.confidence ?? 0;

  const strongPick = usable.filter((p) => isStrong(p.topPick)).sort((x, y) => confidence(y) - confidence(x))[0];

  const standard = usable.filter((p) => !isStrong(p.topPick));
  const opensSomething = standard.filter((p) => !isFreeMarket(p.topPick!.market));
  const pool = opensSomething.length >= HOT_SLOTS + NORMAL_SLOTS ? opensSomething : standard;

  const hot = [...pool]
    .sort((x, y) => hotness(y, social.get(y.match.id)) - hotness(x, social.get(x.match.id)))
    .slice(0, HOT_SLOTS);
  const taken = new Set(hot.map((p) => p.match.id));

  // The best reads among the rest, at most two from one competition so the
  // free set isn't one league's card, unless too few leagues are playing
  // (an international break) to fill the slots that way.
  const perLeague = new Map<string, number>();
  const normal: Prediction[] = [];
  const ranked = [...pool].sort((x, y) => confidence(y) - confidence(x)).filter((p) => !taken.has(p.match.id));
  for (const p of ranked) {
    if (normal.length === NORMAL_SLOTS) break;
    const league = p.match.league.code ?? p.match.league.name;
    if ((perLeague.get(league) ?? 0) >= 2) continue;
    perLeague.set(league, (perLeague.get(league) ?? 0) + 1);
    normal.push(p);
  }
  for (const p of ranked) {
    if (normal.length === NORMAL_SLOTS) break;
    if (!normal.includes(p)) normal.push(p);
  }

  return {
    day,
    strong: strongPick?.match.id ?? null,
    hot: hot.map((p) => p.match.id),
    normal: normal.map((p) => p.match.id),
  };
}
