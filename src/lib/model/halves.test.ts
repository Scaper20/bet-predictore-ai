import { describe, expect, it } from "vitest";
import { firstHalfShare, halfMarkets, DEFAULT_FIRST_HALF_SHARE } from "./halves";

describe("half markets", () => {
  const m = halfMarkets(1.6, 1.1, { home: 0.44, away: 0.44 });

  it("gives proper distributions", () => {
    expect(m.ht.home + m.ht.draw + m.ht.away).toBeCloseTo(1, 6);
    expect(m.highestHalf.first + m.highestHalf.second + m.highestHalf.equal).toBeCloseTo(1, 6);
    expect(Object.values(m.htft).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
  });

  it("matches hand-computed Poisson values", () => {
    // P(no first-half goals) = exp(-(1.6+1.1)*0.44)
    expect(1 - m.htOver["0.5"]).toBeCloseTo(Math.exp(-2.7 * 0.44), 3);
    // Second half has more expected goals, so it is likelier to be the higher-scoring half.
    expect(m.highestHalf.second).toBeGreaterThan(m.highestHalf.first);
    // A draw at half time is far likelier than at full time for these rates.
    expect(m.ht.draw).toBeGreaterThan(0.35);
  });

  it("measures the first-half share and shrinks a thin sample", () => {
    expect(firstHalfShare([]).home).toBe(DEFAULT_FIRST_HALF_SHARE);
    const many = Array.from({ length: 5000 }, () => ({ homeGoals: 2, awayGoals: 1, htHome: 1, htAway: 0 }));
    const s = firstHalfShare(many);
    expect(s.home).toBeCloseTo(0.5, 1);
    expect(s.away).toBeLessThan(0.1);
  });
});
