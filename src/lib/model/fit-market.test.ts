import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { fitLeague, normaliseKey } from "./fit";

/**
 * Alpha's games all finish 1-1, but the closing prices expected it to score 2.2
 * against everyone; every other pairing is level at 1-1 and 1.0 expected.
 */
function rows(withMarket: boolean): ResultRow[] {
  const names = ["Alpha", "Beta", "Gamma", "Delta"];
  const out: ResultRow[] = [];
  const base = Date.now() - 100 * 86_400_000;
  let k = 0;
  for (let rep = 0; rep < 6; rep++)
    for (const h of names)
      for (const a of names) {
        if (h === a) continue;
        out.push({
          homeId: h, awayId: a, homeName: h, awayName: a,
          homeGoals: 1, awayGoals: 1,
          date: base + k++ * 86_400_00, leagueId: "t",
          ...(withMarket ? { homeMkt: h === "Alpha" ? 2.2 : 1, awayMkt: a === "Alpha" ? 2.2 : 1 } : {}),
        });
      }
  return out;
}

const attackOf = (fit: ReturnType<typeof fitLeague>, name: string) => fit.ratings.get(normaliseKey(name))!.attack;

describe("market-implied goals in the fit", () => {
  it("is off by default: rows carrying market goals fit exactly as rows without", () => {
    const a = fitLeague(rows(true), { shotWeight: 0 });
    const b = fitLeague(rows(false), { shotWeight: 0 });
    expect(attackOf(a, "Alpha")).toBeCloseTo(attackOf(b, "Alpha"), 9);
  });

  it("moves a side's attack toward the goals the market expected when mktWeight is on", () => {
    const flat = fitLeague(rows(true), { shotWeight: 0 });
    const blended = fitLeague(rows(true), { shotWeight: 0, mktWeight: 0.6 });
    expect(attackOf(blended, "Alpha")).toBeGreaterThan(attackOf(flat, "Alpha") + 0.05);
  });

  it("changes nothing for a row without market goals, however high the weight", () => {
    const a = fitLeague(rows(false), { shotWeight: 0, mktWeight: 1 });
    const b = fitLeague(rows(false), { shotWeight: 0 });
    expect(attackOf(a, "Alpha")).toBeCloseTo(attackOf(b, "Alpha"), 9);
  });

  it("keeps the scoring level in goals", () => {
    const flat = fitLeague(rows(true), { shotWeight: 0 });
    const blended = fitLeague(rows(true), { shotWeight: 0, mktWeight: 1 });
    expect(blended.baseRate).toBeGreaterThan(0.5 * flat.baseRate);
    expect(blended.baseRate).toBeLessThan(1.5 * flat.baseRate);
  });

  it("caps the shot, xG and market shares together at 1", () => {
    const fit = fitLeague(rows(true), { shotWeight: 0.8, xgWeight: 0.8, mktWeight: 0.8 });
    expect(Number.isFinite(attackOf(fit, "Alpha"))).toBe(true);
  });

  it("ignores a market row whose goals are not positive numbers", () => {
    const bad = rows(true).map((r) => ({ ...r, homeMkt: 0, awayMkt: Number.NaN }));
    const a = fitLeague(bad, { shotWeight: 0, mktWeight: 1 });
    const b = fitLeague(rows(false), { shotWeight: 0 });
    expect(attackOf(a, "Alpha")).toBeCloseTo(attackOf(b, "Alpha"), 9);
  });
});
