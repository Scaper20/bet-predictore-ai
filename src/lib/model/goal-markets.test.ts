import { describe, expect, it } from "vitest";
import { goalMarkets } from "./goal-markets";
import { scoreMatrix } from "./poisson";
import { halfGrids } from "./halves";

describe("goalMarkets", () => {
  const lam = 1.8, mu = 1.0;
  const g = goalMarkets(scoreMatrix(lam, mu, -0.05), halfGrids(lam, mu, { home: 0.443, away: 0.443 }, 0.1));

  it("partitions add up", () => {
    expect(Object.values(g.exactTotal).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    for (const e of Object.values(g.euroHandicap)) expect(e.home + e.draw + e.away).toBeCloseTo(1, 6);
    expect(g.secondHalf.home + g.secondHalf.draw + g.secondHalf.away).toBeCloseTo(1, 6);
    for (const h of Object.values(g.firstHalfHandicap)) expect(h.home + h.away + h.push).toBeCloseTo(1, 6);
  });

  it("orders nested events sensibly", () => {
    expect(g.gg2).toBeLessThan(g.homeOver["1.5"]);
    expect(g.winBothHalves.home).toBeLessThan(g.winEitherHalf.home);
    expect(g.homeOver["2.5"]).toBeLessThan(g.homeOver["1.5"]);
    expect(g.multiGoal["2-3"]).toBeLessThan(g.multiGoal["1-3"]);
    // The stronger home side wins more halves than the away side.
    expect(g.winEitherHalf.home).toBeGreaterThan(g.winEitherHalf.away);
  });

  it("first-half -0.5 is the half-time home win", () => {
    const h = g.firstHalfHandicap["-0.5"];
    expect(h.push).toBe(0);
    expect(g.firstHalfHandicap["+0.5"].home).toBeGreaterThan(h.home);
  });
});
