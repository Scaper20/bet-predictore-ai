/**
 * Odds conversion and value detection.
 *
 * Bookmaker odds carry a margin ("overround" / "vig"): the implied
 * probabilities across a market sum to more than 1, and the excess is the
 * book's edge. Comparing a model probability against the raw implied
 * probability therefore flags value that is not really there, so the margin is
 * stripped first and comparisons are made against the fair price.
 */

import { MIN_MEANINGFUL_EDGE } from "@/lib/value";

export interface ValueAssessment {
  /** Model's probability for the selection. */
  modelProbability: number;
  /** Bookmaker's decimal odds. */
  decimalOdds: number;
  /** Raw implied probability, margin included. */
  impliedProbability: number;
  /** Implied probability after the market margin is removed. */
  fairProbability: number;
  /** Model probability minus fair probability, in percentage points. */
  edge: number;
  /** Expected profit per 1 unit staked. */
  expectedValue: number;
  /** Fraction of bankroll under the Kelly criterion, capped and never negative. */
  kellyStake: number;
  isValue: boolean;
}

export function decimalToImplied(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;
  return 1 / decimalOdds;
}

export function impliedToDecimal(probability: number): number {
  if (probability <= 0) return Infinity;
  return 1 / probability;
}

/** Total implied probability across a market. 1.05 means a 5% margin. */
export function overround(decimalOdds: number[]): number {
  return decimalOdds.reduce((acc, o) => acc + decimalToImplied(o), 0);
}

/**
 * Strip the bookmaker margin proportionally.
 *
 * The proportional method divides each implied probability by the overround.
 * It slightly understates favourites relative to the power method, but it is
 * transparent and stable, which matters more when the numbers are shown to
 * users as the "fair price".
 */
export function removeVig(decimalOdds: number[]): number[] {
  const implied = decimalOdds.map(decimalToImplied);
  const total = implied.reduce((a, b) => a + b, 0);
  if (total <= 0) return implied.map(() => 0);
  return implied.map((p) => p / total);
}

/**
 * Kelly stake for a binary bet.
 *
 * f* = (bp - q) / b, with b the net odds, p the win probability and q = 1 - p.
 * Full Kelly is famously volatile, so callers pass a fraction (default a
 * quarter) and the result is capped — a staking suggestion that tells someone
 * to put a third of their bankroll on one football match is not a feature.
 */
export function kelly(
  probability: number,
  decimalOdds: number,
  fraction = 0.25,
  cap = 0.05,
): number {
  const b = decimalOdds - 1;
  if (b <= 0 || probability <= 0) return 0;
  const q = 1 - probability;
  const f = (b * probability - q) / b;
  if (f <= 0) return 0;
  return Math.min(f * fraction, cap);
}

/** Profit per unit staked, in expectation. */
export function expectedValue(probability: number, decimalOdds: number): number {
  return probability * (decimalOdds - 1) - (1 - probability);
}

/**
 * Assess one selection against a whole market.
 *
 * `marketOdds` should be every price in the same market (all three of 1X2, or
 * both sides of an over/under) so the margin can be removed. Passing just the
 * one price still works, it simply cannot correct for the vig.
 *
 * Named for the market rather than for "value" because src/lib/value.ts
 * answers a narrower and more common question — is this ONE price worth
 * taking, given nothing but the model's probability — and two functions called
 * assessValue with different arguments and different meanings is a trap for
 * whoever reads this next. This one needs the book; that one needs a number.
 */
export function assessAgainstMarket(
  modelProbability: number,
  decimalOdds: number,
  marketOdds?: number[],
  minEdge = MIN_MEANINGFUL_EDGE,
): ValueAssessment {
  const impliedProbability = decimalToImplied(decimalOdds);

  let fairProbability = impliedProbability;
  if (marketOdds && marketOdds.length > 1) {
    const total = overround(marketOdds);
    if (total > 0) fairProbability = impliedProbability / total;
  }

  const edge = modelProbability - fairProbability;
  return {
    modelProbability,
    decimalOdds,
    impliedProbability,
    fairProbability,
    edge,
    expectedValue: expectedValue(modelProbability, decimalOdds),
    kellyStake: kelly(modelProbability, decimalOdds),
    isValue: edge >= minEdge && decimalOdds > 1,
  };
}

/**
 * Fair decimal odds for a model probability, with a margin added back.
 *
 * Used to show "our price" next to a bookmaker's, so users can see where the
 * model disagrees even when no live odds feed is connected.
 */
export function fairOdds(probability: number, margin = 0): number {
  if (probability <= 0) return Infinity;
  return 1 / (probability * (1 + margin));
}

/** Combined probability and price for an accumulator. */
export function accumulator(legs: { probability: number; decimalOdds: number }[]): {
  probability: number;
  decimalOdds: number;
  expectedValue: number;
} {
  if (legs.length === 0) return { probability: 0, decimalOdds: 1, expectedValue: 0 };
  // Legs are treated as independent. Correlated legs (same match, or same
  // league on the same day) break this, which the UI warns about.
  const probability = legs.reduce((acc, l) => acc * l.probability, 1);
  const decimalOdds = legs.reduce((acc, l) => acc * l.decimalOdds, 1);
  return {
    probability,
    decimalOdds,
    expectedValue: expectedValue(probability, decimalOdds),
  };
}
