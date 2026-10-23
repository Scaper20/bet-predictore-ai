import { describe, expect, it } from "vitest";
import { closingLineValue, closingSnapshot, compactPrices, priceInSnapshot } from "./market-prob";

const markets = [
  { market_id: "1", specifier: null, outcomes: [{ id: "1", odds: "2.10", probability: "0.4500" }, { id: "2", odds: "3.40" }, { id: "3", odds: "3.60" }] },
  { market_id: "18", specifier: "total=2.5", outcomes: [{ id: "12", odds: "1.80" }, { id: "13", odds: "2.00" }] },
  { market_id: "18", specifier: "total=5.5", outcomes: [{ id: "12", odds: "9.00" }, { id: "13", odds: "1.05" }] },
  { market_id: "10", specifier: null, outcomes: [{ id: "9", odds: "1.30" }, { id: "10", odds: "1.33" }, { id: "11", odds: "1.75" }] },
  { market_id: "37", specifier: "total=2.5", outcomes: [{ id: "796", odds: "3.00" }] },
];

describe("compactPrices", () => {
  it("keeps the main markets and lines, with SportyBet's probability where given", () => {
    const c = compactPrices(markets);
    expect(Object.keys(c).sort()).toEqual(["10|", "18|total=2.5", "1|"]);
    expect(c["1|"]["1"]).toEqual([2.1, 0.45]);
    expect(c["1|"]["2"]).toEqual([3.4, null]);
  });
});

describe("priceInSnapshot", () => {
  const c = compactPrices(markets);

  it("strips the margin across the whole market", () => {
    const home = priceInSnapshot(c, "1x2:home")!;
    expect(home.odds).toBe(2.1);
    // 1/2.10 + 1/3.40 + 1/3.60 = 1.0480; 0.4762 / 1.0480 = 0.4544
    expect(home.fairProbability).toBeCloseTo(0.4544, 3);
    const over = priceInSnapshot(c, "ou:over:2.5")!;
    expect(over.fairProbability).toBeCloseTo(0.5263, 3);
  });

  it("handles double chance, whose outcomes overlap", () => {
    const hd = priceInSnapshot(c, "dc:home-draw")!;
    expect(hd.fairProbability).toBeGreaterThan(0.7);
    expect(hd.fairProbability).toBeLessThan(0.75);
  });

  it("refuses markets the snapshot does not carry", () => {
    expect(priceInSnapshot(c, "ou:over:4.5")).toBeNull();
    expect(priceInSnapshot(c, "btts:yes")).toBeNull();
    expect(priceInSnapshot({ "1|": { "1": [2.1, null] } }, "1x2:home")).toBeNull();
  });
});

describe("closing line", () => {
  it("takes the last snapshot before kick-off", () => {
    const ko = 1_000_000;
    const snaps = [ko - 500, ko - 100, ko + 50].map((t) => ({ capturedAt: t, prices: {} }));
    expect(closingSnapshot(snaps, ko)?.capturedAt).toBe(ko - 100);
    expect(closingSnapshot([], ko)).toBeNull();
  });

  it("scores beating the close as positive", () => {
    expect(closingLineValue(2.1, 2.0)).toBe(0.05);
    expect(closingLineValue(1.8, 2.0)).toBe(-0.1);
  });
});
