import { describe, expect, it } from "vitest";
import { paced, stageFor } from "./build-progress";

describe("Forge build progress", () => {
  it("starts at zero, climbs steadily and never claims done on its own", () => {
    expect(paced(0, 5000)).toBe(0);
    expect(paced(2500, 5000)).toBeGreaterThan(paced(1000, 5000));
    expect(paced(5000, 5000)).toBeGreaterThan(75);
    expect(paced(60_000, 5000)).toBeLessThanOrEqual(95);
  });

  it("names the step for each part of the bar", () => {
    expect(stageFor(10)).toBe("Reading the fixtures");
    expect(stageFor(90)).toBe("Checking SportyBet prices");
    expect(stageFor(100)).toBe("Done");
  });
});
