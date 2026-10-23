import { describe, expect, it } from "vitest";
import { pairedLogLoss, priceSkill } from "./price-skill";

describe("priceSkill", () => {
  it("measures closing line value", () => {
    const s = priceSkill([
      { probability: 0.6, marketProbability: 0.55, priceAtPublish: 2.0, closingPrice: 1.8, result: "win" },
      { probability: 0.6, marketProbability: 0.55, priceAtPublish: 1.8, closingPrice: 2.0, result: "lose" },
      { probability: 0.6, marketProbability: null, priceAtPublish: null, closingPrice: 1.9, result: "win" },
    ]);
    expect(s.clv).toEqual({ n: 2, beatClose: 0.5, average: expect.closeTo((2 / 1.8 - 1 + (1.8 / 2 - 1)) / 2, 3) });
  });

  it("scores the model, the market and the blend on the same decided picks", () => {
    const s = priceSkill([
      { probability: 0.8, marketProbability: 0.6, priceAtPublish: null, closingPrice: null, result: "win" },
      { probability: 0.8, marketProbability: 0.6, priceAtPublish: null, closingPrice: null, result: "lose" },
      { probability: 0.7, marketProbability: 0.6, priceAtPublish: null, closingPrice: null, result: "push" },
    ]).forecasts!;
    expect(s.n).toBe(2);
    expect(s.model.brier).toBeCloseTo((0.04 + 0.64) / 2, 4);
    expect(s.market.brier).toBeCloseTo((0.16 + 0.36) / 2, 4);
    expect(s.blend.brier).toBeCloseTo((0.09 + 0.49) / 2, 4);
    expect(s.market.logLoss).toBeLessThan(s.model.logLoss);
  });

  it("is empty without priced picks", () => {
    expect(priceSkill([])).toEqual({ clv: null, forecasts: null });
  });
});

it("compares two forecasts by log loss", () => {
  const r = pairedLogLoss([{ a: 0.9, b: 0.6, won: true }])!;
  expect(r.a).toBeLessThan(r.b);
});
