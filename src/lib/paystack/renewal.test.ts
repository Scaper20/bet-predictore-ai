import { describe, expect, it } from "vitest";
import { cycleFromInterval, renewedPeriodEnd } from "./renewal";

describe("cycleFromInterval", () => {
  it("maps the intervals we sell", () => {
    expect(cycleFromInterval("monthly")).toBe("monthly");
    expect(cycleFromInterval("quarterly")).toBe("quarterly");
    expect(cycleFromInterval("annually")).toBe("yearly");
    expect(cycleFromInterval("weekly")).toBeUndefined();
    expect(cycleFromInterval(undefined)).toBeUndefined();
  });
});

describe("renewedPeriodEnd", () => {
  const now = new Date("2026-10-24T13:10:00Z");

  it("adds a cycle to a period that hasn't ended", () => {
    const end = new Date("2026-10-24T14:00:00Z");
    expect(renewedPeriodEnd(end, now, "monthly").toISOString()).toBe("2026-11-24T14:00:00.000Z");
    expect(renewedPeriodEnd(end, now, "quarterly").toISOString()).toBe("2027-01-24T14:00:00.000Z");
  });

  it("starts from now when the period has lapsed", () => {
    const end = new Date("2026-10-20T00:00:00Z");
    expect(renewedPeriodEnd(end, now, "yearly").toISOString()).toBe("2027-10-24T13:10:00.000Z");
    expect(renewedPeriodEnd(null, now, "monthly").toISOString()).toBe("2026-11-24T13:10:00.000Z");
  });
});
