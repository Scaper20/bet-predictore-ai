import { describe, expect, it } from "vitest";
import {
  accumulator, assessAgainstMarket, decimalToImplied, expectedValue,
  fairOdds, impliedToDecimal, kelly, overround, removeVig,
} from "./odds";

describe("odds conversion", () => {
  it("converts decimal odds to implied probability", () => {
    expect(decimalToImplied(2)).toBeCloseTo(0.5, 12);
    expect(decimalToImplied(4)).toBeCloseTo(0.25, 12);
    expect(decimalToImplied(1.5)).toBeCloseTo(0.6667, 4);
  });

  it("rejects nonsensical prices instead of returning Infinity", () => {
    expect(decimalToImplied(1)).toBe(0);
    expect(decimalToImplied(0)).toBe(0);
    expect(decimalToImplied(Number.NaN)).toBe(0);
  });

  it("round-trips through implied probability", () => {
    for (const o of [1.2, 2.5, 3.75, 11]) {
      expect(impliedToDecimal(decimalToImplied(o))).toBeCloseTo(o, 10);
    }
  });
});

describe("margin handling", () => {
  // A typical Nigerian bookmaker 1X2 market carries roughly 5-8% margin.
  const market = [2.1, 3.4, 3.6];

  it("measures the overround", () => {
    expect(overround(market)).toBeGreaterThan(1);
    expect(overround([2, 2])).toBeCloseTo(1, 12);
  });

  it("removes the margin so fair probabilities sum to 1", () => {
    const fair = removeVig(market);
    expect(fair.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    // Order is preserved: the favourite stays the favourite.
    expect(fair[0]).toBeGreaterThan(fair[1]);
    expect(fair[0]).toBeGreaterThan(fair[2]);
  });

  it("leaves an already-fair market untouched", () => {
    const fair = removeVig([2, 2]);
    expect(fair[0]).toBeCloseTo(0.5, 12);
  });
});

describe("kelly staking", () => {
  it("stakes nothing on a negative-edge bet", () => {
    expect(kelly(0.4, 2)).toBe(0);
    expect(kelly(0.5, 1.8)).toBe(0);
  });

  it("stakes more as the edge widens", () => {
    const small = kelly(0.52, 2);
    const big = kelly(0.65, 2);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it("never exceeds the cap, however extreme the edge", () => {
    expect(kelly(0.99, 10)).toBeLessThanOrEqual(0.05);
    expect(kelly(1, 50)).toBeLessThanOrEqual(0.05);
  });

  it("matches the closed form before the fraction and cap apply", () => {
    // p=0.6, odds=2 -> b=1, f* = (1*0.6 - 0.4)/1 = 0.2; quarter Kelly = 0.05.
    expect(kelly(0.6, 2, 0.25, 1)).toBeCloseTo(0.05, 12);
  });
});

describe("expected value", () => {
  it("is zero at a fair price", () => {
    expect(expectedValue(0.5, 2)).toBeCloseTo(0, 12);
  });
  it("is positive when the model beats the price", () => {
    expect(expectedValue(0.6, 2)).toBeCloseTo(0.2, 12);
  });
  it("is negative when the price beats the model", () => {
    expect(expectedValue(0.4, 2)).toBeCloseTo(-0.2, 12);
  });
});

describe("value assessment", () => {
  const market = [2.1, 3.4, 3.6];

  it("flags a genuine edge against the fair price", () => {
    const v = assessAgainstMarket(0.55, 2.1, market);
    expect(v.fairProbability).toBeLessThan(v.impliedProbability);
    expect(v.edge).toBeGreaterThan(0);
    expect(v.isValue).toBe(true);
    expect(v.kellyStake).toBeGreaterThan(0);
  });

  it("does not flag value that only exists because the vig was ignored", () => {
    // Model agrees with the fair price; raw implied probability looks beatable.
    const fair = removeVig(market)[0];
    const v = assessAgainstMarket(fair, market[0], market);
    expect(v.edge).toBeCloseTo(0, 9);
    expect(v.isValue).toBe(false);
  });

  it("marks a clearly bad price as no value", () => {
    const v = assessAgainstMarket(0.3, 2.1, market);
    expect(v.edge).toBeLessThan(0);
    expect(v.isValue).toBe(false);
    expect(v.kellyStake).toBe(0);
  });
});

describe("accumulator", () => {
  it("multiplies independent legs", () => {
    const acc = accumulator([
      { probability: 0.5, decimalOdds: 2 },
      { probability: 0.5, decimalOdds: 2 },
    ]);
    expect(acc.probability).toBeCloseTo(0.25, 12);
    expect(acc.decimalOdds).toBeCloseTo(4, 12);
    expect(acc.expectedValue).toBeCloseTo(0, 12);
  });

  it("shows how fast the hit rate collapses as legs are added", () => {
    const legs = Array.from({ length: 8 }, () => ({ probability: 0.6, decimalOdds: 1.7 }));
    const acc = accumulator(legs);
    // 0.6^8 is under 2%: the headline warning the slip builder shows users.
    expect(acc.probability).toBeCloseTo(0.6 ** 8, 12);
    expect(acc.probability).toBeLessThan(0.02);
    expect(acc.decimalOdds).toBeCloseTo(1.7 ** 8, 9);
  });

  it("compounds the edge when every leg is individually +EV", () => {
    // Each leg prices 0.6 at 1.7, so it returns 1.02 per unit; eight of them
    // multiply to 1.02^8. A parlay does not turn good bets into bad ones.
    const legs = Array.from({ length: 8 }, () => ({ probability: 0.6, decimalOdds: 1.7 }));
    expect(accumulator(legs).expectedValue).toBeCloseTo(1.02 ** 8 - 1, 9);
  });

  it("compounds the loss when every leg is -EV, which is the usual case", () => {
    // A realistic bookmaker price on a 60% shot is nearer 1.55, which is -EV.
    const legs = Array.from({ length: 6 }, () => ({ probability: 0.6, decimalOdds: 1.55 }));
    const acc = accumulator(legs);
    expect(acc.expectedValue).toBeLessThan(0);
    expect(acc.expectedValue).toBeCloseTo(0.93 ** 6 - 1, 9);
  });

  it("handles the empty slip", () => {
    expect(accumulator([]).decimalOdds).toBe(1);
  });
});

describe("fair odds", () => {
  it("inverts a probability", () => {
    expect(fairOdds(0.25)).toBeCloseTo(4, 12);
  });
  it("shortens the price when a margin is applied", () => {
    expect(fairOdds(0.25, 0.05)).toBeLessThan(fairOdds(0.25));
  });
});
