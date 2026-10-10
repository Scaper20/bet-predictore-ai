import { describe, expect, it } from "vitest";
import { addCycle, canBuy, nextPeriodEnd } from "./period";

const now = new Date("2026-10-10T12:00:00Z");

describe("addCycle", () => {
  it("adds calendar months", () => {
    expect(addCycle(now, "monthly").toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(addCycle(now, "quarterly").toISOString()).toBe("2027-01-10T12:00:00.000Z");
    expect(addCycle(now, "yearly").toISOString()).toBe("2027-10-10T12:00:00.000Z");
  });

  it("clamps to the end of a shorter month", () => {
    expect(addCycle(new Date("2027-01-31T08:00:00Z"), "monthly").toISOString()).toBe("2027-02-28T08:00:00.000Z");
  });
});

describe("nextPeriodEnd", () => {
  it("starts now for a first payment", () => {
    expect(nextPeriodEnd(null, "pro", "monthly", now).toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("stacks a renewal on the end of the running period", () => {
    const current = { tier: "pro", status: "active", current_period_end: "2026-10-25T00:00:00Z" };
    expect(nextPeriodEnd(current, "pro", "monthly", now).toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });

  it("starts an upgrade now, and ignores a lapsed period", () => {
    const pro = { tier: "pro", status: "active", current_period_end: "2026-10-25T00:00:00Z" };
    expect(nextPeriodEnd(pro, "vip", "monthly", now).toISOString()).toBe("2026-11-10T12:00:00.000Z");
    const lapsed = { tier: "pro", status: "active", current_period_end: "2026-09-01T00:00:00Z" };
    expect(nextPeriodEnd(lapsed, "pro", "monthly", now).toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });
});

describe("canBuy", () => {
  it("refuses a downgrade while VIP runs, allows anything else", () => {
    const vip = { tier: "vip", status: "active", current_period_end: "2026-12-01T00:00:00Z" };
    expect(canBuy(vip, "pro", now).ok).toBe(false);
    expect(canBuy(vip, "vip", now).ok).toBe(true);
    expect(canBuy({ tier: "pro", status: "active", current_period_end: "2026-12-01T00:00:00Z" }, "vip", now).ok).toBe(true);
    expect(canBuy(null, "pro", now).ok).toBe(true);
  });
});
