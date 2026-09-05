import { describe, expect, it } from "vitest";
import { BASELINE, empiricalBaselines, FAMILY_RELIABILITY } from "./predict";
import type { ResultRow } from "@/lib/types";

function results(spec: [home: number, away: number][], count = 1): ResultRow[] {
  const out: ResultRow[] = [];
  for (let i = 0; i < count; i++) {
    for (const [h, a] of spec) {
      out.push({
        homeId: `h${i}`, homeName: `Home ${i}`,
        awayId: `a${i}`, awayName: `Away ${i}`,
        homeGoals: h, awayGoals: a,
        date: Date.now() - i * 86_400_000,
        leagueId: "test",
      });
    }
  }
  return out;
}

describe("empiricalBaselines", () => {
  it("falls back to the pooled prior with no history at all", () => {
    expect(empiricalBaselines([])).toEqual(BASELINE);
  });

  it("moves toward what the competition actually does", () => {
    // A resolutely low-scoring league: every match finishes 1-0.
    const baselines = empiricalBaselines(results([[1, 0]], 200));

    // The prior says overs land 52% of the time. This competition says never.
    expect(BASELINE["ou:over:2.5"]).toBeCloseTo(0.52);
    expect(baselines["ou:over:2.5"]).toBeLessThan(0.1);
    expect(baselines["1x2:home"]).toBeGreaterThan(0.8);
  });

  it("shrinks harder the thinner the sample", () => {
    const thin = empiricalBaselines(results([[1, 0]], 10));
    const thick = empiricalBaselines(results([[1, 0]], 400));
    const prior = BASELINE["1x2:home"];

    // Both move the same way; the thin one moves much less far.
    expect(thin["1x2:home"]).toBeGreaterThan(prior);
    expect(thick["1x2:home"]).toBeGreaterThan(thin["1x2:home"]);
    // Ten matches must not be allowed to carry a baseline most of the way.
    expect(thin["1x2:home"] - prior).toBeLessThan((1 - prior) / 2);
  });

  it("keeps complementary selections summing to one", () => {
    const b = empiricalBaselines(results([[2, 1], [0, 0], [3, 2], [1, 1]], 30));
    for (const line of ["0.5", "1.5", "2.5", "3.5", "4.5"]) {
      expect(b[`ou:over:${line}`] + b[`ou:under:${line}`]).toBeCloseTo(1, 10);
    }
    expect(b["btts:yes"] + b["btts:no"]).toBeCloseTo(1, 10);
    expect(b["1x2:home"] + b["1x2:draw"] + b["1x2:away"]).toBeCloseTo(1, 10);
  });

  it("keeps double chance consistent with the outcomes it is made of", () => {
    const b = empiricalBaselines(results([[2, 1], [0, 0], [1, 3]], 40));
    expect(b["dc:home-draw"]).toBeCloseTo(b["1x2:home"] + b["1x2:draw"], 10);
    expect(b["dc:away-draw"]).toBeCloseTo(b["1x2:away"] + b["1x2:draw"], 10);
    expect(b["dc:home-away"]).toBeCloseTo(b["1x2:home"] + b["1x2:away"], 10);
  });

  it("covers exactly the markets the ranker scores against", () => {
    expect(Object.keys(empiricalBaselines(results([[1, 1]], 20))).sort()).toEqual(
      Object.keys(BASELINE).sort(),
    );
  });
});

describe("FAMILY_RELIABILITY", () => {
  it("only ever shrinks an edge, never inflates one", () => {
    // A family that beat its claim in one season must not have that
    // compounded into the next one; only the shrinkage direction is trusted.
    for (const [family, weight] of Object.entries(FAMILY_RELIABILITY)) {
      expect(weight, family).toBeLessThanOrEqual(1);
      expect(weight, family).toBeGreaterThan(0);
    }
  });

  it("discounts the goals markets, which offer the most candidates", () => {
    // Ten selections per fixture against three for the match result: the
    // goals family wins the argmax far more often than its accuracy earns.
    expect(FAMILY_RELIABILITY.ou).toBeLessThan(FAMILY_RELIABILITY["1x2"]);
    expect(FAMILY_RELIABILITY.btts).toBeLessThan(FAMILY_RELIABILITY.dc);
  });
});
