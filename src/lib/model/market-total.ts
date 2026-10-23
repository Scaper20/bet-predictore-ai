import { jointProbability } from "@/lib/forge";
import { scoreMatrix } from "./poisson";

/**
 * Market-informed totals (shadow only; 0071_market_total_shadow.sql).
 *
 * docs/stats-markets.md found that taking the expected total goals from the
 * closing over/under 2.5 price roughly doubles skill on totals. Here the
 * model's goal rates are scaled together until its over 2.5 matches
 * SportyBet's de-vigged one, keeping the model's split between the sides,
 * and the lines the price was not set from (1.5 and 3.5) are read off the
 * scaled grid. Logged beside the model's own chance and graded; nothing is
 * published from it until it beats the model on log loss.
 */

export interface MarketTotalPick {
  market: string;
  label: string;
  /** Chance from the market-scaled grid. */
  probability: number;
  /** The model's own chance of the same selection. */
  modelProbability: number;
}

const overOf = (grid: number[][], line: number) => jointProbability(grid, [`ou:over:${line}`]);

/** The factor on both goal rates that makes the model's over 2.5 equal `overFair`. */
export function totalScale(home: number, away: number, rho: number, overFair: number): number | null {
  if (!(overFair > 0.05 && overFair < 0.95)) return null;
  let lo = 0.3;
  let hi = 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (overOf(scoreMatrix(home * mid, away * mid, rho), 2.5) < overFair) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  return s > 0.31 && s < 2.99 ? s : null;
}

const round = (p: number) => Math.round(p * 10_000) / 10_000;

/** The 1.5 and 3.5 leans from the market-scaled grid, each beside the model's own chance. */
export function marketTotalPicks(
  expected: { home: number; away: number },
  rho: number,
  overFair: number,
): MarketTotalPick[] {
  const s = totalScale(expected.home, expected.away, rho, overFair);
  if (s === null) return [];
  const model = scoreMatrix(expected.home, expected.away, rho);
  const market = scoreMatrix(expected.home * s, expected.away * s, rho);
  return [1.5, 3.5].map((line) => {
    const over = overOf(market, line);
    const side = over >= 0.5 ? "over" : "under";
    const key = `ou:${side}:${line}`;
    return {
      market: key,
      label: `${side === "over" ? "Over" : "Under"} ${line} goals`,
      probability: round(jointProbability(market, [key])),
      modelProbability: round(jointProbability(model, [key])),
    };
  });
}
