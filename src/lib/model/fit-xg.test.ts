import { describe, expect, it } from "vitest";
import type { ResultRow } from "@/lib/types";
import { fitLeague, normaliseKey } from "./fit";

/** Alpha scores 1 a game but creates 2.5 xG; every other pairing is level. */
function rows(withXg: boolean): ResultRow[] {
  const names = ["Alpha", "Beta", "Gamma", "Delta"];
  const out: ResultRow[] = [];
  const base = Date.now() - 100 * 86_400_000;
  let k = 0;
  for (let rep = 0; rep < 6; rep++)
    for (const h of names)
      for (const a of names) {
        if (h === a) continue;
        const alphaHome = h === "Alpha";
        const alphaAway = a === "Alpha";
        out.push({
          homeId: h, awayId: a, homeName: h, awayName: a,
          homeGoals: alphaHome ? 1 : 1, awayGoals: alphaAway ? 1 : 1,
          date: base + k++ * 86_400_00, leagueId: "t",
          ...(withXg ? { homeXg: alphaHome ? 2.5 : 1, awayXg: alphaAway ? 2.5 : 1 } : {}),
        });
      }
  return out;
}

const attackOf = (fit: ReturnType<typeof fitLeague>, name: string) => fit.ratings.get(normaliseKey(name))!.attack;

describe("xG in the fit", () => {
  it("is off by default: rows with xG fit exactly as rows without", () => {
    const a = fitLeague(rows(true), { shotWeight: 0 });
    const b = fitLeague(rows(false), { shotWeight: 0 });
    expect(attackOf(a, "Alpha")).toBeCloseTo(attackOf(b, "Alpha"), 9);
  });

  it("moves a side's attack toward the chances it creates when xgWeight is on", () => {
    const flat = fitLeague(rows(true), { shotWeight: 0 });
    const blended = fitLeague(rows(true), { shotWeight: 0, xgWeight: 0.5 });
    expect(attackOf(blended, "Alpha")).toBeGreaterThan(attackOf(flat, "Alpha") + 0.05);
  });

  it("changes nothing for a row without xG, however high the weight", () => {
    const a = fitLeague(rows(false), { shotWeight: 0, xgWeight: 1 });
    const b = fitLeague(rows(false), { shotWeight: 0 });
    expect(attackOf(a, "Alpha")).toBeCloseTo(attackOf(b, "Alpha"), 9);
  });

  it("keeps the scoring level in goals", () => {
    const flat = fitLeague(rows(true), { shotWeight: 0 });
    const blended = fitLeague(rows(true), { shotWeight: 0, xgWeight: 1 });
    expect(blended.baseRate).toBeGreaterThan(0.5 * flat.baseRate);
    expect(blended.baseRate).toBeLessThan(1.5 * flat.baseRate);
  });

  it("caps the shots and xG shares together at 1", () => {
    const fit = fitLeague(rows(true), { shotWeight: 0.8, xgWeight: 0.8 });
    expect(Number.isFinite(attackOf(fit, "Alpha"))).toBe(true);
  });
});
