import { describe, expect, it } from "vitest";
import { IMPLIED_RHO, impliedRates, marketGoals } from "./market-goals";
import { scoreMatrix } from "./poisson";

/** Fair chances and decimal prices a bookmaker with a proportional margin would post for a pair of goal rates. */
function pricesFor(lambda: number, mu: number, margin = 1.05) {
  const g = scoreMatrix(lambda, mu, IMPLIED_RHO);
  let h = 0;
  let d = 0;
  let a = 0;
  let over = 0;
  for (let x = 0; x < g.length; x++)
    for (let y = 0; y < g[x].length; y++) {
      if (x > y) h += g[x][y];
      else if (x === y) d += g[x][y];
      else a += g[x][y];
      if (x + y > 2) over += g[x][y];
    }
  return {
    oneXTwo: { home: 1 / (h * margin), draw: 1 / (d * margin), away: 1 / (a * margin) },
    overUnder: { over: 1 / (over * margin), under: 1 / ((1 - over) * margin) },
  };
}

describe("market-implied goals", () => {
  it.each([
    [1.8, 0.9],
    [1.1, 1.4],
    [2.6, 1.6],
    [0.9, 0.7],
    [1.4, 1.4],
  ])("recovers the rates (%d, %d) a margin-laden price was built from", (lambda, mu) => {
    const p = pricesFor(lambda, mu);
    const got = marketGoals(p.oneXTwo, p.overUnder)!;
    expect(got[0]).toBeCloseTo(lambda, 1);
    expect(got[1]).toBeCloseTo(mu, 1);
  });

  it("is symmetric: swapping the sides swaps the goals", () => {
    const p = pricesFor(1.9, 0.8);
    const q = pricesFor(0.8, 1.9);
    const a = marketGoals(p.oneXTwo, p.overUnder)!;
    const b = marketGoals(q.oneXTwo, q.overUnder)!;
    expect(a[0]).toBeCloseTo(b[1], 1);
    expect(a[1]).toBeCloseTo(b[0], 1);
  });

  it("gives more total goals to a higher over price's complement", () => {
    const low = pricesFor(1.0, 0.8);
    const high = pricesFor(2.0, 1.6);
    const l = marketGoals(low.oneXTwo, low.overUnder)!;
    const h = marketGoals(high.oneXTwo, high.overUnder)!;
    expect(h[0] + h[1]).toBeGreaterThan(l[0] + l[1] + 1);
  });

  it("returns null for prices that cannot be real", () => {
    const ok = pricesFor(1.5, 1.1);
    expect(marketGoals({ ...ok.oneXTwo, home: 1 }, ok.overUnder)).toBeNull();
    expect(marketGoals({ ...ok.oneXTwo, draw: Number.NaN }, ok.overUnder)).toBeNull();
    expect(marketGoals(ok.oneXTwo, { over: 0, under: 2 })).toBeNull();
    expect(marketGoals(ok.oneXTwo, { over: 1.8, under: 500 })).toBeNull();
  });

  it("stays finite on a lopsided game", () => {
    const g = impliedRates(0.82, 0.04, 0.7, IMPLIED_RHO, [1.45, 1.15]);
    expect(g[0]).toBeGreaterThan(2);
    expect(g[1]).toBeLessThan(0.7);
    expect(Number.isFinite(g[0] + g[1])).toBe(true);
  });
});
