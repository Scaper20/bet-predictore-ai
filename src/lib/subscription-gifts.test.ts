import { describe, it, expect } from "vitest";
import { bestGiftTier, effectiveEntitlement } from "@/lib/subscription-gifts";

describe("bestGiftTier", () => {
  it("returns null with no gifts", () => {
    expect(bestGiftTier([])).toBeNull();
  });

  it("returns the only tier for a single gift", () => {
    expect(bestGiftTier([{ tier: "pro" }])).toBe("pro");
  });

  it("picks the highest-ranked tier across several live gifts", () => {
    expect(bestGiftTier([{ tier: "pro" }, { tier: "vip" }, { tier: "pass" }])).toBe("vip");
  });
});

describe("effectiveEntitlement", () => {
  it("leaves a free base alone with no gift", () => {
    const base = { tier: "free" as const, status: "none" as const };
    expect(effectiveEntitlement(base, null)).toEqual(base);
  });

  it("boosts a free user to the gifted tier, marked active", () => {
    const base = { tier: "free" as const, status: "none" as const };
    expect(effectiveEntitlement(base, "vip")).toEqual({ tier: "vip", status: "active" });
  });

  it("never lowers access — a paying VIP gifted Pro keeps VIP", () => {
    const base = { tier: "vip" as const, status: "active" as const };
    expect(effectiveEntitlement(base, "pro")).toEqual(base);
  });

  it("keeps a cancelled-but-still-in-grace-period subscription's own status when it already beats the gift", () => {
    const base = { tier: "pro" as const, status: "cancelled" as const };
    expect(effectiveEntitlement(base, "pass")).toEqual(base);
  });

  it("a tie between base and gift tier keeps the base result", () => {
    const base = { tier: "pro" as const, status: "past_due" as const };
    expect(effectiveEntitlement(base, "pro")).toEqual(base);
  });
});
