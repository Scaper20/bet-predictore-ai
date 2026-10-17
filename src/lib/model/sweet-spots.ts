/**
 * Sweet spots: the selections that, above a set chance, have landed at least
 * 82% of the time, in a season they were not chosen on. Where one applies it
 * becomes the KiqStat pick for the game; elsewhere the usual ranking stands.
 *
 * Found by scripts/niche-lab.ts (--ship): 12,749 games in the 17 divisions
 * below, replayed walk-forward, with only the live goals model. For each
 * selection, the lowest chance at which its 2024-25 record reached 82% (100+
 * picks); on 2025-26, one pick per game from these rules landed 82.0% against
 * 75.6% for the usual ranking (6,820 games), with every division between 79%
 * and 85%, 93% of weeks at 75% or better, and no run of more than 4 misses.
 * The same rules landed 82.1% on 2024-25. Asian handicaps carry most of it:
 * away +1.5 and home +1.5 picks landed 82.5% against 80.1% stated.
 *
 * Win rate is bought with shorter prices: these picks average fair odds of
 * about 1.27, against 1.37 for the usual ranking. SWEET_SPOT_MAX keeps every
 * one at fair odds of 1.18 or more.
 *
 * The thresholds below were refitted on both seasons (each within 0.03 of its
 * 2024-25 value); `record` is that refit's hit rate and decides which rule
 * wins when several apply. Corners, shots and shots on target held their
 * stated chance too, but adding them landed no more often (81.2% with corners)
 * and they cannot be graded from the score, so they stay on the match page.
 */

import type { Pick } from "./predict";

export interface SweetSpot {
  market: string;
  /** Lowest chance at which the rule applies. */
  min: number;
  /** Hit rate of the rule over both replayed seasons. */
  record: number;
}

/** Strongest record first; the first rule that applies picks the game. */
export const SWEET_SPOTS: readonly SweetSpot[] = [
  { market: "dc:home-away", min: 0.8, record: 0.845 },
  { market: "1x2:home", min: 0.69, record: 0.832 },
  { market: "dc:home-draw", min: 0.76, record: 0.828 },
  { market: "ah:away:1.5", min: 0.74, record: 0.825 },
  { market: "ah:home:1.5", min: 0.79, record: 0.824 },
  { market: "dc:away-draw", min: 0.74, record: 0.821 },
  { market: "ou:over:1.5", min: 0.8, record: 0.82 },
];

/** Shorter than fair odds of 1.18 a pick is near-certain and not worth publishing. */
export const SWEET_SPOT_MAX = 0.85;

/** The divisions the rules were found and tested on. Everywhere else keeps the usual ranking. */
export const SWEET_SPOT_LEAGUES: ReadonlySet<string> = new Set([
  "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
  "championship", "eredivisie", "primeira-liga", "scottish-premiership",
  "belgian-pro-league", "super-lig", "greek-super-league", "league-one",
  "bundesliga-2", "serie-b", "la-liga-2", "ligue-2",
]);

/** The game's sweet-spot pick, or null when no rule applies (or the competition was not tested). */
export function sweetSpotPick(picks: readonly Pick[], leagueCode: string | undefined, barred: readonly string[] = []): Pick | null {
  if (!leagueCode || !SWEET_SPOT_LEAGUES.has(leagueCode)) return null;
  let best: { pick: Pick; rule: SweetSpot } | null = null;
  for (const rule of SWEET_SPOTS) {
    if (barred.includes(rule.market)) continue;
    const pick = picks.find((p) => p.market === rule.market);
    if (!pick || pick.probability < rule.min || pick.probability > SWEET_SPOT_MAX) continue;
    if (!best || rule.record > best.rule.record || (rule.record === best.rule.record && pick.probability > best.pick.probability)) best = { pick, rule };
  }
  return best?.pick ?? null;
}
