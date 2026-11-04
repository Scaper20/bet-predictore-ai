import { describe, expect, it } from "vitest";
import { chargeKind, cycleFromPlanLabel, resolveCycle } from "./charge-kind";

describe("chargeKind", () => {
  it("calls an unseen reference a renewal, with or without metadata", () => {
    expect(chargeKind({ onceFlag: false, offerFlag: false, knownReference: false })).toBe("renewal");
  });
  it("calls a reference our checkout wrote a first charge", () => {
    expect(chargeKind({ onceFlag: false, offerFlag: false, knownReference: true })).toBe("first");
  });
  it("keeps pay-once and offer checkouts apart", () => {
    expect(chargeKind({ onceFlag: true, offerFlag: false, knownReference: true })).toBe("once");
    expect(chargeKind({ onceFlag: false, offerFlag: true, knownReference: true })).toBe("offer");
  });
});

describe("cycleFromPlanLabel", () => {
  it("reads the cycle from our plan labels", () => {
    expect(cycleFromPlanLabel("vip:monthly")).toBe("monthly");
    expect(cycleFromPlanLabel("pro:quarterly:once")).toBe("quarterly");
    expect(cycleFromPlanLabel("vip:yearly")).toBe("yearly");
  });
  it("ignores labels that name no cycle", () => {
    expect(cycleFromPlanLabel("offer:vip-day-pass")).toBeUndefined();
    expect(cycleFromPlanLabel("renewal")).toBeUndefined();
    expect(cycleFromPlanLabel(null)).toBeUndefined();
  });
});

describe("resolveCycle", () => {
  it("prefers the interval on the charge", () => {
    expect(resolveCycle({ interval: "annually", codeCycle: "monthly", lastPlanLabel: "pro:quarterly" })).toEqual({ cycle: "yearly", source: "interval" });
  });
  it("falls back to the plan code, then to the member's last payment", () => {
    expect(resolveCycle({ codeCycle: "quarterly", lastPlanLabel: "vip:monthly" })).toEqual({ cycle: "quarterly", source: "plan-code" });
    expect(resolveCycle({ lastPlanLabel: "vip:monthly" })).toEqual({ cycle: "monthly", source: "last-payment" });
  });
  it("says none rather than guessing", () => {
    expect(resolveCycle({ interval: "weekly", lastPlanLabel: "renewal" })).toEqual({ source: "none" });
  });
});
