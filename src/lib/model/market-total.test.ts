import { describe, expect, it } from "vitest";
import { jointProbability } from "@/lib/forge";
import { scoreMatrix } from "./poisson";
import { marketTotalPicks, totalScale } from "./market-total";

describe("totalScale", () => {
  it("finds the scale that matches the market's over 2.5", () => {
    const s = totalScale(1.4, 1.1, -0.05, 0.6)!;
    expect(jointProbability(scoreMatrix(1.4 * s, 1.1 * s, -0.05), ["ou:over:2.5"])).toBeCloseTo(0.6, 3);
  });

  it("refuses a price it cannot trust", () => {
    expect(totalScale(1.4, 1.1, 0, 0.99)).toBeNull();
  });
});

describe("marketTotalPicks", () => {
  it("moves the 1.5 and 3.5 lines the way the market moves the total", () => {
    const model = marketTotalPicks({ home: 1.3, away: 1.0 }, 0, 0.45);
    const higher = marketTotalPicks({ home: 1.3, away: 1.0 }, 0, 0.65);
    expect(model.map((p) => p.market)).toEqual(["ou:over:1.5", "ou:under:3.5"]);
    expect(higher[0].probability).toBeGreaterThan(model[0].probability);
    // The model's own chance does not depend on the price.
    expect(higher[0].modelProbability).toBe(model[0].modelProbability);
  });
});
