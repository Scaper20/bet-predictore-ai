import { describe, expect, it } from "vitest";
import { computePassExpiry, computeWeekendPassExpiry } from "./pass-window";

const HOUR = 3_600_000;

describe("computePassExpiry", () => {
  const bought = new Date("2026-10-07T10:00:00Z"); // a Wednesday

  it("runs a Day pass for 24 hours and a Week pass for 7 days", () => {
    expect(computePassExpiry("day", bought).getTime()).toBe(bought.getTime() + 24 * HOUR);
    expect(computePassExpiry("week", bought).getTime()).toBe(bought.getTime() + 7 * 24 * HOUR);
  });

  it("keeps the Fri–Mon rule for the Weekend pass", () => {
    expect(computePassExpiry("weekend", bought).getTime()).toBe(computeWeekendPassExpiry(bought).getTime());
  });

  it("never shortens a pass that is still running", () => {
    const week = computePassExpiry("week", bought);
    expect(computePassExpiry("day", bought, week)).toEqual(week);
    // ...but a longer one bought on top does extend it.
    const day = computePassExpiry("day", bought);
    expect(computePassExpiry("week", bought, day).getTime()).toBeGreaterThan(day.getTime());
  });
});
