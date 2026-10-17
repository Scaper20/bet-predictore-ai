import { describe, expect, it } from "vitest";
import { scoreMatrix } from "./poisson";
import { calibrateResult, plattScale, RESULT_CALIBRATION, resultCalibrationFor } from "./result-calibration";

const oneXTwo = (g: number[][]) => {
  let h = 0, d = 0, a = 0;
  g.forEach((row, x) => row.forEach((p, y) => (x > y ? (h += p) : x === y ? (d += p) : (a += p))));
  return { h, d, a };
};

describe("result calibration", () => {
  it("stretches a clear favourite and keeps the grid a distribution", () => {
    const before = oneXTwo(scoreMatrix(2.0, 0.8, -0.05));
    const g = calibrateResult(scoreMatrix(2.0, 0.8, -0.05), RESULT_CALIBRATION);
    const after = oneXTwo(g);
    expect(after.h + after.d + after.a).toBeCloseTo(1, 9);
    expect(after.h).toBeGreaterThan(before.h);
    expect(after.d).toBeLessThan(before.d);
  });

  it("moves a home win stated 70% to about 76%, as the replay record says", () => {
    expect(plattScale(RESULT_CALIBRATION.home, 0.7)).toBeGreaterThan(0.74);
    expect(plattScale(RESULT_CALIBRATION.home, 0.7)).toBeLessThan(0.78);
  });

  it("keeps a level game close to level", () => {
    const after = oneXTwo(calibrateResult(scoreMatrix(1.3, 1.3, 0), RESULT_CALIBRATION));
    expect(Math.abs(after.h - after.a)).toBeLessThan(0.05);
    expect(after.d).toBeGreaterThan(0.2);
  });

  it("applies only where the replay showed it holds", () => {
    expect(resultCalibrationFor("premier-league")).not.toBeNull();
    expect(resultCalibrationFor("champions-league")).not.toBeNull();
    expect(resultCalibrationFor("mls")).toBeNull();
    expect(resultCalibrationFor("liga-mx")).toBeNull();
    expect(resultCalibrationFor(undefined)).toBeNull();
  });
});
