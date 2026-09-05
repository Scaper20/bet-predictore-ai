import { describe, expect, it } from "vitest";
import {
  calibration,
  deVig,
  marketFamily,
  returnAtClose,
  summarise,
  type BacktestEntry,
} from "./backtest";

function entry(over: Partial<BacktestEntry> = {}): BacktestEntry {
  return { market: "1x2:home", league: "premier-league", probability: 0.6, outcome: "win", ...over };
}

describe("returnAtClose", () => {
  it("settles a win at the price and a loss at the stake", () => {
    const r = returnAtClose([
      entry({ price: 2.5, outcome: "win" }),
      entry({ price: 2.5, outcome: "lose" }),
    ]);
    expect(r.staked).toBe(2);
    expect(r.profit).toBeCloseTo(0.5);
    expect(r.roi).toBeCloseTo(0.25);
  });

  it("returns the stake on a push — no profit, but still staked", () => {
    // A void bet ties up the bankroll without paying for it, which is why it
    // counts in `staked` and not in `profit`.
    const r = returnAtClose([entry({ price: 1.9, outcome: "push" })]);
    expect(r.staked).toBe(1);
    expect(r.profit).toBe(0);
    expect(r.roi).toBe(0);
  });

  it("skips selections with no usable price rather than assuming one", () => {
    const r = returnAtClose([
      entry({ outcome: "win" }),
      entry({ price: 1, outcome: "win" }),
      entry({ price: Number.NaN, outcome: "win" }),
      entry({ price: 2, outcome: "win" }),
    ]);
    expect(r.priced).toBe(1);
    expect(r.roi).toBeCloseTo(1);
  });

  it("has no return at all when nothing was priced", () => {
    expect(returnAtClose([entry()]).roi).toBeNull();
  });
});

describe("deVig", () => {
  it("normalises an overround book to exactly 1", () => {
    // A typical 1X2 book at about 5% margin.
    const p = deVig([2.1, 3.4, 3.6]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // Order is preserved: shortest price stays likeliest, longest stays least.
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(p[1]).toBeGreaterThan(p[2]);
    // And every probability is below its own raw implied one, since the
    // margin that inflated all three has been taken back out.
    expect(p[0]).toBeLessThan(1 / 2.1);
  });

  it("leaves a book that is already fair alone", () => {
    expect(deVig([2, 2])).toEqual([0.5, 0.5]);
  });

  it("degrades to zeroes rather than dividing by nothing", () => {
    expect(deVig([0, 0])).toEqual([0, 0]);
  });
});

describe("calibration", () => {
  it("bins on the claimed probability and reports the realised rate", () => {
    const bins = calibration([
      ...Array.from({ length: 6 }, () => entry({ probability: 0.62, outcome: "win" })),
      ...Array.from({ length: 4 }, () => entry({ probability: 0.68, outcome: "lose" })),
    ]);
    expect(bins).toHaveLength(1);
    expect(bins[0].from).toBeCloseTo(0.6);
    expect(bins[0].n).toBe(10);
    expect(bins[0].claimed).toBeCloseTo(0.644);
    expect(bins[0].realised).toBeCloseTo(0.6);
  });

  it("excludes pushes, which say nothing about the probability", () => {
    const bins = calibration([
      entry({ probability: 0.55, outcome: "win" }),
      entry({ probability: 0.55, outcome: "push" }),
    ]);
    expect(bins[0].n).toBe(1);
    expect(bins[0].realised).toBe(1);
  });

  it("puts a probability of exactly 1 in the top bin rather than off the end", () => {
    const bins = calibration([entry({ probability: 1, outcome: "win" })]);
    expect(bins).toHaveLength(1);
    expect(bins[0].to).toBe(1);
  });
});

describe("summarise", () => {
  it("separates the hit rate from the claim", () => {
    const s = summarise([
      ...Array.from({ length: 5 }, () => entry({ probability: 0.8, outcome: "win" })),
      ...Array.from({ length: 5 }, () => entry({ probability: 0.8, outcome: "lose" })),
    ]);
    expect(s.overall.hitRate).toBeCloseTo(0.5);
    expect(s.overall.claimed).toBeCloseTo(0.8);
    // The whole point of the report: a claim of 80% delivering 50%.
    expect(s.overall.gap).toBeCloseTo(-30);
  });

  it("groups by market family, not by full market id", () => {
    const s = summarise([
      entry({ market: "ou:over:2.5" }),
      entry({ market: "ou:under:1.5" }),
      entry({ market: "1x2:home" }),
    ]);
    expect(s.byMarketFamily.get("ou")?.n).toBe(2);
    expect(s.byMarketFamily.get("1x2")?.n).toBe(1);
    expect(s.byMarket.get("ou:over:2.5")?.n).toBe(1);
  });

  it("scores the model against the market on the same selections", () => {
    // The model is right and confident; the market was not.
    const s = summarise([
      entry({ probability: 0.9, marketProbability: 0.5, outcome: "win" }),
      entry({ probability: 0.9, marketProbability: 0.5, outcome: "win" }),
    ]);
    expect(s.marketBenchmark.n).toBe(2);
    expect(s.marketBenchmark.modelBrier).toBeCloseTo(0.01);
    expect(s.marketBenchmark.marketBrier).toBeCloseTo(0.25);
  });

  it("reports no Brier when every entry was void", () => {
    const s = summarise([entry({ outcome: "push" })]);
    expect(s.brier).toBeNull();
    expect(s.overall.hitRate).toBeNull();
  });
});

describe("marketFamily", () => {
  it("takes the prefix predictions_log groups on", () => {
    expect(marketFamily("ou:over:2.5")).toBe("ou");
    expect(marketFamily("cs:2-1")).toBe("cs");
    expect(marketFamily("btts:yes")).toBe("btts");
  });
});
