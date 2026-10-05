import { describe, expect, it } from "vitest";
import { cycleSaving, passOption, planById, PASS_OPTIONS } from "./pricing";

describe("plan pricing", () => {
  it("prices the new structure", () => {
    expect(planById("pro").price).toEqual({ monthly: 5000, quarterly: 13500, yearly: 48000 });
    expect(planById("vip").price).toEqual({ monthly: 12000, yearly: 115200 });
    expect(PASS_OPTIONS.map((o) => o.price)).toEqual([500, 1000, 2000]);
  });

  it("computes what a longer cycle saves against monthly", () => {
    expect(cycleSaving(planById("pro"), "quarterly")).toEqual({ amount: 1500, percent: 10 });
    expect(cycleSaving(planById("pro"), "yearly")).toEqual({ amount: 12000, percent: 20 });
    expect(cycleSaving(planById("vip"), "yearly")).toEqual({ amount: 28800, percent: 20 });
    expect(cycleSaving(planById("vip"), "quarterly")).toBeNull();
  });

  it("keeps four Week passes dearer than a month of Pro", () => {
    expect(4 * passOption("week").price).toBeGreaterThan(planById("pro").price.monthly!);
  });

  it("falls back to the Weekend pass for an unknown length", () => {
    expect(passOption("fortnight").id).toBe("weekend");
    expect(passOption(undefined).id).toBe("weekend");
  });
});
