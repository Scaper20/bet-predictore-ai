/**
 * From a projection and the bookmaker's listed lines to what a player prop
 * shows: a ladder of lines either side of the projection (each marked
 * bookable or model-only) and at most one pick, which is always a line the
 * bookmaker lists, so it can be booked.
 *
 * Thresholds come from the props backtest (docs/props-backtest.md): from 70%
 * up every market's calibrated probabilities landed within about two points of
 * what they said; above 90% they ran one to two points high. So a pick needs
 * 72% to 88%, a price worth taking, and the bookmaker not far below us.
 */

import type { PlayerLine } from "@/lib/odds/player-lines";
import { impliedChance } from "@/lib/odds/player-lines";
import { calibrate, propLadder, type PropMarketKey } from "./player-props";

export const PROP_FLOOR = 0.72;
export const PROP_CAP = 0.88;
/** Shorter than this the price is not worth the pick's risk. */
export const PROP_MIN_PRICE = 1.25;
/** Skip a line the bookmaker rates this much (or more) below the model: it knows something (or we are wrong). */
export const PROP_MARKET_GAP = 0.1;

export type PropRisk = "low" | "medium" | "high";

/** Backtest bands: 80%+ landed about 8 in 10 or better; 72-80% about 3 in 4. */
export function propRisk(p: number): PropRisk {
  if (p >= 0.8) return "low";
  if (p >= PROP_FLOOR) return "medium";
  return "high";
}

export interface LadderRung {
  line: number;
  over: number;
  under: number;
  /** Bookmaker prices where it lists this line (null when it does not). */
  overPrice: number | null;
  underPrice: number | null;
}

export interface PropPick {
  line: number;
  side: "over" | "under";
  probability: number;
  marketProbability: number | null;
  price: number;
  selection: string;
  risk: PropRisk;
}

/** The ±`each` ladder, calibrated, with the bookmaker's prices merged in. */
export function buildLadder(mean: number, size: number, market: PropMarketKey, calibration: number, listed: readonly PlayerLine[], each = 3): LadderRung[] {
  const byLine = new Map(listed.map((l) => [l.line, l]));
  const rungs: LadderRung[] = propLadder(mean, size, market, each).map((r) => {
    const over = calibrate(r.over, calibration);
    const l = byLine.get(r.line);
    return { line: r.line, over, under: 1 - over, overPrice: l?.overOdds ?? null, underPrice: l?.underOdds ?? null };
  });
  return rungs;
}

/**
 * The pick for one player and market among the lines the bookmaker lists:
 * the side and line with the best agreed chance (the lower of ours and the
 * bookmaker's) within the floor and cap, at a price worth taking.
 */
export function choosePick(
  probOver: (line: number) => number,
  listed: readonly PlayerLine[],
  selection: (l: PlayerLine, side: "over" | "under") => string | null,
): PropPick | null {
  let best: (PropPick & { agreed: number }) | null = null;
  for (const l of listed) {
    const over = probOver(l.line);
    for (const side of ["over", "under"] as const) {
      const price = side === "over" ? l.overOdds : l.underOdds;
      const sel = selection(l, side);
      if (price === null || !sel) continue;
      const p = side === "over" ? over : 1 - over;
      if (p < PROP_FLOOR || p > PROP_CAP || price < PROP_MIN_PRICE) continue;
      const market = impliedChance(l, side);
      if (market !== null && p - market >= PROP_MARKET_GAP) continue;
      const agreed = Math.min(p, market ?? p);
      if (!best || agreed > best.agreed + 1e-9) {
        best = { line: l.line, side, probability: p, marketProbability: market, price, selection: sel, risk: propRisk(p), agreed };
      }
    }
  }
  if (!best) return null;
  const { agreed: _agreed, ...pick } = best;
  void _agreed;
  return pick;
}

/** "Over 1.5 in 6 of his last 8 starts" style facts for a line. */
export function hitFact(values: readonly number[], line: number, side: "over" | "under"): { hits: number; of: number } {
  const of = values.length;
  const hits = values.filter((v) => (side === "over" ? v > line : v < line)).length;
  return { hits, of };
}
