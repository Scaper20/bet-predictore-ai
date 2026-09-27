/**
 * Whether a price is worth taking.
 *
 * This is the only arithmetic in the product that decides money rather than
 * describing it, and it exists because of what the backtest found.
 *
 * Measured over 4,502 priced picks across three seasons of the five biggest
 * European leagues, flat-staking the headline pick at market-average closing
 * prices returned -2.17%. Broken down every way that could be acted on
 * before kickoff -- by market, by price band, by the model's own confidence --
 * nothing was consistently positive: the markets that made money in 2023-25
 * lost it in 2025-26 and vice versa, with the signs flipping on samples of
 * several hundred. There is no subset of its own picks the model can point at
 * and say "these ones pay".
 *
 * What that means is worth stating precisely, because it sounds worse than it
 * is: the model is close to market-efficient. It recovers about half the
 * bookmaker's margin, which is a real result for a from-scratch fit, and it is
 * also not an edge. An edge would mean beating the price, and against the
 * closing consensus it does not.
 *
 * So the money question is not "which pick wins" -- the site already answers
 * that as well as it can -- but "is the price in front of me worse than the
 * model's". A user offered 1.60 on a selection the model makes a 1.75 shot is
 * losing money on every such bet regardless of how often it lands, and nothing
 * else on the site tells them so. That is the loss this module exists to stop.
 *
 * No odds are invented anywhere. Every function here takes a price the user
 * typed in, and returns nothing at all when they have not typed one.
 */

export type ValueRating = "no-bet" | "thin" | "value";

/**
 * Whose probability the price is being judged against.
 *
 * It changes nothing arithmetically and everything about what the answer
 * means, so it is carried explicitly rather than left to the caller's memory.
 * "model" is this product's own estimate, which the backtest puts roughly level
 * with the market. "market" is forty books' de-vigged median, which is the
 * sharper of the two and the one worth quoting when it exists.
 */
export type ValueBenchmark = "model" | "market";

export interface ValueVerdict {
  /** Expected return per unit staked: probability * price - 1. */
  edge: number;
  /**
   * The shortest price at which this selection stops being a losing bet.
   * Numerically the model's fair odds; named for the decision it supports,
   * because "fair price" reads as a fact about the selection and this reads
   * as an instruction.
   */
  breakEven: number;
  rating: ValueRating;
  /** One plain sentence, rendered verbatim. */
  reason: string;
}

/**
 * Edge below this is treated as no edge.
 *
 * Not a taste setting. The model's calibration error on held-out data is
 * 2.1 percentage points, and its measured return against closing consensus is
 * -2.17%. An edge inside that band is smaller than the model's own
 * demonstrated error, so calling it value would be reading noise as signal --
 * the exact mistake this codebase spent a release removing everywhere else.
 */
export const MIN_MEANINGFUL_EDGE = 0.03;

/** Expected return per unit staked. Negative means the price is too short. */
export function edge(probability: number, price: number): number {
  return probability * price - 1;
}

/** The shortest price at which a selection breaks even. */
export function breakEvenPrice(probability: number): number {
  return probability > 0 ? 1 / probability : Number.POSITIVE_INFINITY;
}

/**
 * Assess a price the user has actually been offered.
 *
 * Returns null when there is no offered price. That is deliberate: with no
 * price there is no value question, and answering it anyway would mean
 * supplying a price, which is how the invented-odds problem started.
 */
export function assessValue(
  probability: number,
  offeredPrice: number | undefined,
  benchmark: ValueBenchmark = "model",
): ValueVerdict | null {
  if (offeredPrice === undefined || !Number.isFinite(offeredPrice) || offeredPrice <= 1) {
    return null;
  }
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;

  const value = edge(probability, offeredPrice);
  const breakEven = breakEvenPrice(probability);
  const market = benchmark === "market";

  if (value < 0) {
    return {
      edge: value,
      breakEven,
      rating: "no-bet",
      reason:
        `At ${offeredPrice.toFixed(2)} this loses money however often it lands. ` +
        (market
          ? `The rest of the market makes it a ${breakEven.toFixed(2)} shot.`
          : `It needs ${breakEven.toFixed(2)} just to break even.`),
    };
  }

  if (value < MIN_MEANINGFUL_EDGE) {
    return {
      edge: value,
      breakEven,
      rating: "thin",
      reason:
        `Barely above break-even at ${breakEven.toFixed(2)}. ` +
        (market
          ? "An edge that small is inside the spread between books, so it is a fair price " +
            "rather than a good one."
          : "An edge this small is inside the model's own margin of error, so treat it as a " +
            "fair price rather than a good one."),
    };
  }

  return {
    edge: value,
    breakEven,
    rating: "value",
    reason:
      `${offeredPrice.toFixed(2)} is longer than the ${breakEven.toFixed(2)} this needs. ` +
      (market
        ? "That gap is the rest of the market disagreeing with this price, which is the one " +
          "kind of edge that does not depend on the model being right."
        : "That gap is where a return comes from — if the model is right about the chance."),
  };
}

/**
 * The worst leg on a slip, which is the one worth showing first.
 *
 * A combined expected return hides its own composition: one leg at a terrible
 * price and one at a good one average out to something unremarkable, and the
 * user takes both. Averages are how bad prices survive.
 */
export function worstLeg<T>(
  legs: T[],
  read: (leg: T) => { probability: number; price: number | undefined },
): { leg: T; verdict: ValueVerdict } | null {
  let worst: { leg: T; verdict: ValueVerdict } | null = null;
  for (const leg of legs) {
    const { probability, price } = read(leg);
    const verdict = assessValue(probability, price);
    if (!verdict) continue;
    if (!worst || verdict.edge < worst.verdict.edge) worst = { leg, verdict };
  }
  return worst;
}
