/**
 * Picks on lines SportyBet actually lists.
 *
 * The fixed corners and shots rules (model/sweet-spots.ts) chose the safest
 * line the count model liked: Under 12.5 corners, Away +3.5 shots on target.
 * SportyBet sets its lines near the middle of each game (corners mostly at
 * 9.5 or 10.5; 12.5 on 3 of 138 games on the board in October 2026), and it
 * has no shots handicap at all, so those picks could not be loaded: 31
 * Under 12.5 corners picks in a month, none of them with a price.
 *
 * Here every corners, shots and shots-on-target outcome on the game's board
 * is priced with the model, and the strongest one both sides agree on is
 * the pick: judged by the lower of the model's chance and SportyBet's
 * (margin stripped), the same rule the market check swaps headline picks by.
 * Bookings are priced on the site but never picked.
 *
 * Pure: the caller brings the board (odds/sportybet.ts) and a pricer
 * (leg-pricing.ts statLegPricer over the fixture's count grids).
 */
import { fromSportyBet, priceOn, readOdds, toSportyBet } from "@/lib/odds/markets";
import { fairChanceOn } from "@/lib/odds/market-prob";
import { twinsOf } from "@/lib/odds/bookable";
import type { RawMarket } from "@/lib/odds/sportybet-api";
import { isStatMarket, sweetSpotLabel, SWEET_SPOT_MAX } from "@/lib/model/sweet-spots";

/**
 * The least likely listed corners or shots line published as a pick.
 *
 * Replayed over 13,231 games in the 17 tested divisions (July 2024 on,
 * scripts/listed-lines-lab.ts, SportyBet's ladder and ~7% margin modelled
 * from its board): every listed line is honestly priced (stated 77.3%,
 * landed 76.9%). On the 7,217 games where an old fixed-line rule fired,
 * moving it to the best listed line at 78%+ (else to the goals or result
 * pick) landed 77.9% against 76.5% stated, and the goals or result pick
 * alone 77.5%; at 72% or 75% it landed 77.2-77.3%. The old fixed lines
 * "landed" 84.8%, on lines SportyBet listed on 2% of those games.
 */
export const LISTED_STAT_FLOOR = 0.78;
/** Shorter than this SportyBet's price is not worth a pick's risk. */
export const LISTED_MIN_PRICE = 1.18;

export interface ListedLine {
  market: string;
  label: string;
  /** The model's chance the pick survives. */
  probability: number;
  /** SportyBet's chance, margin stripped; null when its market is incomplete. */
  marketChance: number | null;
  price: number;
}

/** Every corners, shots and shots-on-target outcome on the board, with the model's and SportyBet's chance. */
export function listedStatLines(markets: readonly RawMarket[] | undefined, priceStat: (market: string) => number | null): ListedLine[] {
  if (!markets?.length) return [];
  const out: ListedLine[] = [];
  const seen = new Set<string>();
  for (const m of markets) {
    for (const o of m.outcomes ?? []) {
      const market = fromSportyBet({ marketId: String(m.market_id), outcomeId: String(o.id), specifier: m.specifier ?? undefined });
      if (!market || seen.has(market) || !isStatMarket(market)) continue;
      seen.add(market);
      const price = readOdds(o.odds);
      if (price === undefined) continue;
      const probability = priceStat(market);
      if (probability === null) continue;
      out.push({ market, label: sweetSpotLabel(market), probability, marketChance: fairChanceOn(market, markets), price });
    }
  }
  return out;
}

export interface ListedPickOptions {
  floor?: number;
  cap?: number;
  minPrice?: number;
  /** Skip a line SportyBet rates this far or more below the model (market-check.ts). */
  gap: number;
}

/** The two views' lower chance: what a line is ranked by. */
export const consensus = (l: ListedLine) => Math.min(l.probability, l.marketChance ?? l.probability);

/**
 * The strongest listed line both views agree on, or null. A line needs
 * SportyBet's full market (so the margin can be stripped) and a price worth
 * taking; the model must not be far above SportyBet on it.
 */
export function bestListedLine(lines: readonly ListedLine[], opts: ListedPickOptions): ListedLine | null {
  const floor = opts.floor ?? LISTED_STAT_FLOOR;
  const cap = opts.cap ?? SWEET_SPOT_MAX;
  const minPrice = opts.minPrice ?? LISTED_MIN_PRICE;
  let best: ListedLine | null = null;
  for (const l of lines) {
    if (l.marketChance === null) continue;
    if (l.probability < floor || l.probability > cap || l.price < minPrice) continue;
    if (l.probability - l.marketChance >= opts.gap - 1e-9) continue;
    if (!best || consensus(l) > consensus(best) + 1e-9 || (Math.abs(consensus(l) - consensus(best)) <= 1e-9 && l.probability > best.probability)) best = l;
  }
  return best;
}

/** Whether SportyBet lists this selection, or a same-bet twin of it, on the board. */
export function listedOn(market: string, markets: readonly RawMarket[] | undefined): boolean {
  if (!markets?.length) return false;
  return [market, ...twinsOf(market).map((t) => t.market)].some((m) => {
    const sel = toSportyBet(m);
    return Boolean(sel && priceOn(sel, markets) !== undefined);
  });
}
