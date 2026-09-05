/**
 * What a whole market of bookmakers thinks a selection is worth.
 *
 * This module exists because of the single most important finding in the
 * backtest, and it is worth restating plainly: measured over 4,502 priced
 * picks, the model returns about -2% against closing consensus. It is close to
 * market-efficient and it does not beat the price. So "the model says 55% and
 * the price implies 50%, therefore value" is not a claim this product can
 * honestly make -- that 5-point gap is inside the model's own error.
 *
 * What CAN be said honestly is narrower and, for a Nigerian user, worth more:
 * forty-odd books price the same match, they disagree, and the disagreement is
 * measurable. If the de-vigged consensus makes a selection a 47% shot and
 * SportyBet is offering 2.30 on it, that is a +8% edge derived entirely from
 * the market, with no model opinion in it at all. The edge is in the price
 * shopping, not in the prediction.
 *
 * Pure, and deliberately ignorant of where the numbers came from: the adapter
 * translates a feed into BookMarket rows and everything here is arithmetic on
 * those. That keeps the part that decides money separately testable from the
 * part that does HTTP.
 */

import { removeVig, overround } from "@/lib/model/odds";

/**
 * One book's prices for one market on one fixture, narrowed to a single line.
 *
 * `prices` is the WHOLE market -- all three of 1X2, both sides of an
 * over/under -- because a single price cannot be de-vigged. `index` says which
 * of them is the selection being asked about.
 */
export interface BookMarket {
  book: string;
  title: string;
  prices: number[];
  index: number;
}

export interface BookPrice {
  book: string;
  title: string;
  price: number;
}

export interface MarketQuote {
  /**
   * The market's own probability for this selection, margin removed, taken as
   * the median across books.
   *
   * Median rather than mean, because one book leaving a stale price up is a
   * routine occurrence and the mean would carry it. The median ignores it.
   */
  fairProbability: number;
  /** The longest price anyone in the sample is offering. */
  best: BookPrice;
  /** The sharpest single opinion, when the sharp book priced this market. */
  sharp: BookPrice | null;
  /** How many books survived the sanity filter and formed the median. */
  books: number;
  /** Median margin across those books -- what the market is charging. */
  margin: number;
}

/**
 * The book treated as the sharpest single opinion.
 *
 * Pinnacle takes large stakes at thin margins and moves its line on money
 * rather than on opinion, which is why it is the reference the betting
 * literature uses. It is shown alongside the median rather than instead of it:
 * one book is one opinion, however good.
 */
export const SHARP_BOOK = "pinnacle";

/**
 * Fewer books than this is not a consensus.
 *
 * Three is the floor at which a median means anything at all -- with two it is
 * a mean, and with one it is a quote. Below it, callers get null and the UI
 * falls back to the model's own break-even, saying so.
 */
export const MIN_BOOKS = 3;

/**
 * Overround bounds a real, live market sits inside.
 *
 * Under 0.98 the book is offering an arbitrage against itself, which in
 * practice means a stale or partially-suspended market rather than free money.
 * Over 1.30 is not a price anyone should be measured against. Both get dropped
 * before the median, because a junk row shifts a small sample.
 */
const MIN_OVERROUND = 0.98;
const MAX_OVERROUND = 1.3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** True when a book's prices look like a live market rather than a stale one. */
function usable(entry: BookMarket): boolean {
  if (entry.prices.length < 2) return false;
  if (entry.index < 0 || entry.index >= entry.prices.length) return false;
  if (!entry.prices.every((p) => Number.isFinite(p) && p > 1)) return false;
  const total = overround(entry.prices);
  return total >= MIN_OVERROUND && total <= MAX_OVERROUND;
}

/**
 * The market's verdict on one selection, or null when too few books priced it.
 *
 * Null is a real answer and not a failure: plenty of markets on plenty of
 * fixtures genuinely are not priced widely, and inventing a consensus from two
 * quotes would be the same class of error as inventing the odds themselves.
 */
export function consensus(entries: BookMarket[]): MarketQuote | null {
  const live = entries.filter(usable);
  if (live.length < MIN_BOOKS) return null;

  const fair: number[] = [];
  const margins: number[] = [];
  let best: BookPrice | null = null;
  let sharp: BookPrice | null = null;

  for (const entry of live) {
    const price = entry.prices[entry.index];
    fair.push(removeVig(entry.prices)[entry.index]);
    margins.push(overround(entry.prices) - 1);

    if (!best || price > best.price) {
      best = { book: entry.book, title: entry.title, price };
    }
    if (entry.book === SHARP_BOOK) {
      sharp = { book: entry.book, title: entry.title, price };
    }
  }

  const fairProbability = median(fair);
  // A degenerate median means the de-vig produced nothing usable, which should
  // be impossible after `usable` but is cheap to refuse rather than publish.
  if (!(fairProbability > 0) || fairProbability >= 1) return null;

  return {
    fairProbability,
    best: best!,
    sharp,
    books: live.length,
    margin: median(margins),
  };
}

/**
 * How much longer one price is than another, as a fraction.
 *
 * Used to say "SportyBet is 4% longer than the market's best" without asking
 * the reader to divide two decimals in their head.
 */
export function priceGap(offered: number, reference: number): number {
  if (!(reference > 1) || !(offered > 1)) return 0;
  return offered / reference - 1;
}

export type PriceRating = "value" | "best" | "competitive" | "short" | "poor";

export interface PriceVerdict {
  rating: PriceRating;
  /**
   * Expected return per unit staked at this price, against the market's own
   * fair probability. Almost always negative, and that is not a defect: the
   * negative number IS the bookmaker's margin, which every book charges.
   */
  vsFair: number;
  /** How this price compares to the longest one in the sample. */
  vsBest: number;
  /** Against the sharp book's price, when it priced this market. */
  vsSharp: number | null;
  /** One plain sentence, rendered verbatim. */
  reason: string;
}

/**
 * Rate a real price against what the rest of the market is really offering.
 *
 * This exists because measuring an offered price against a de-vigged fair
 * probability produces the same answer every single time. Checked live across
 * a full Premier League round, SportyBet came out between -0.7% and -5.2%
 * against fair on every selection of every fixture -- as would William Hill,
 * Bet365 and Pinnacle, because a book that priced at fair value would make no
 * money. A "don't take it" badge on all twenty selections tells a user
 * nothing they can act on and trains them to ignore the badge.
 *
 * What varies, and therefore what informs, is the comparison against prices
 * other books are ACTUALLY OFFERING. In the same sample SportyBet matched the
 * best price of twenty-five European books on Newcastle to win, and was 2%
 * short of the best on over 2.5 in the same match. That is a real difference
 * between two bets a user might place today, and it is the difference this
 * rates.
 *
 * The "value" rating is kept for the genuinely rare case where an offered
 * price sits above fair. It should almost never fire. When it does it is worth
 * far more than the other four ratings combined, which is exactly why it must
 * not be diluted by firing on everything.
 */
export function ratePrice(offered: number, quote: MarketQuote): PriceVerdict | null {
  if (!(offered > 1)) return null;

  const vsFair = offered * quote.fairProbability - 1;
  const vsBest = priceGap(offered, quote.best.price);
  const vsSharp = quote.sharp ? priceGap(offered, quote.sharp.price) : null;
  const books = quote.books;

  if (vsFair > 0) {
    return {
      rating: "value",
      vsFair,
      vsBest,
      vsSharp,
      reason:
        `At ${offered.toFixed(2)} this is longer than the ${books} books here make it ` +
        `(${(1 / quote.fairProbability).toFixed(2)} with the margin taken out). That is a real ` +
        "edge, and it does not depend on our model being right about anything.",
    };
  }

  // Rounding: a price equal to the best in the sample lands microscopically
  // below zero often enough that a bare `>= 0` would call it merely
  // competitive. A tenth of a percent is well inside a single price tick.
  if (vsBest >= -0.001) {
    return {
      rating: "best",
      vsFair,
      vsBest,
      vsSharp,
      reason:
        `${offered.toFixed(2)} matches the longest price of the ${books} books here. You are ` +
        "not leaving anything on the table on this one.",
    };
  }

  if (vsBest >= -0.02) {
    return {
      rating: "competitive",
      vsFair,
      vsBest,
      vsSharp,
      reason:
        `Within ${Math.abs(vsBest * 100).toFixed(1)}% of the best of ${books} books ` +
        `(${quote.best.price.toFixed(2)}). A normal price, fairly priced.`,
    };
  }

  if (vsBest >= -0.05) {
    return {
      rating: "short",
      vsFair,
      vsBest,
      vsSharp,
      reason:
        `${Math.abs(vsBest * 100).toFixed(1)}% short of the ${quote.best.price.toFixed(2)} ` +
        `available elsewhere. Over a season that gap is most of what separates a winning ` +
        "record from a losing one.",
    };
  }

  return {
    rating: "poor",
    vsFair,
    vsBest,
    vsSharp,
    reason:
      `${offered.toFixed(2)} is ${Math.abs(vsBest * 100).toFixed(1)}% below the ` +
      `${quote.best.price.toFixed(2)} on offer elsewhere — a wide gap even before the ` +
      "margin. This is the one to think twice about.",
  };
}
