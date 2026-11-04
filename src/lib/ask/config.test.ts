import { describe, expect, it } from "vitest";
import { askConfig, cycleOfPlan, lagosDay, passCapMicros, passQuestions } from "./config";

describe("askConfig", () => {
  it("enforces by default, so a missing setting can never mean unmetered spend", () => {
    const c = askConfig({});
    expect(c).toMatchObject({ model: "claude-haiku-5-5", maxTokens: 8000, maxRounds: 6, effort: "medium", guard: "enforce", passDaily: 30 });
    expect(c.requestCeilingMicros).toBe(20_000);
    expect(c.dailyCapMicros.pro).toBe(40_000);
    expect(c.label).toBe("haiku-5-5/8000/6/medium");
    expect(askConfig({ ASK_GUARD: "Observe " }).guard).toBe("enforce");
    expect(askConfig({ ASK_GUARD: "observe" }).guard).toBe("observe");
    expect(askConfig({ ASK_GUARD: "off" }).guard).toBe("off");
  });
  it("reads test settings and clamps nonsense", () => {
    const c = askConfig({ ASK_MAX_TOKENS: "1500", ASK_MAX_ROUNDS: "40", ASK_EFFORT: "low", ASK_GUARD: "enforce", ASK_REQUEST_CEILING_USD: "0.01", ASK_DAILY_CAP_USD_VIP: "abc", ASK_PASS_DAILY: "20" });
    expect(c).toMatchObject({ maxTokens: 1500, maxRounds: 10, effort: "low", guard: "enforce", requestCeilingMicros: 10_000, passDaily: 20 });
    expect(c.dailyCapMicros.vip).toBe(100_000);
  });
  it("lets the lab override one run's settings", () => {
    expect(askConfig({}, { maxTokens: 1200, maxRounds: 4, effort: "low" }).label).toBe("haiku-5-5/1200/4/low");
  });
});

describe("caps by billing cycle", () => {
  it("gives quarterly and yearly days a lower cap, overridable per cycle", () => {
    const c = askConfig({ ASK_DAILY_CAP_USD_VIP_YEARLY: "0.07" });
    expect(c.cycleCapMicros.pro).toEqual({ monthly: 40_000, quarterly: 40_000, yearly: 35_000 });
    expect(c.cycleCapMicros.vip).toEqual({ monthly: 100_000, quarterly: 90_000, yearly: 70_000 });
  });
  it("reads the cycle from a payment's plan", () => {
    expect(cycleOfPlan("vip:yearly")).toBe("yearly");
    expect(cycleOfPlan("pro:quarterly:once")).toBe("quarterly");
    expect(cycleOfPlan("pro:monthly")).toBe("monthly");
    expect(cycleOfPlan(undefined)).toBe("monthly");
    expect(cycleOfPlan("offer:vip-day-pass")).toBe("monthly");
  });
});

describe("pass ceilings", () => {
  const c = askConfig({});
  it("uses the offer's cap, else the env cap, else a share of what was paid", () => {
    expect(passCapMicros(c, 0.255, 100_000)).toBe(255_000);
    expect(passCapMicros(askConfig({ ASK_PASS_CAP_USD: "0.1" }), null, 50_000)).toBe(100_000);
    expect(passCapMicros(c, null, 50_000)).toBe(140_000); // ₦500 → $0.14
    expect(passCapMicros(c, null, 30_000)).toBe(84_000);
  });
  it("counts questions over the whole pass, per 24 hours", () => {
    expect(passQuestions(c, 24)).toBe(30);
    expect(passQuestions(c, 72)).toBe(90);
    expect(passQuestions(c, 6)).toBe(8);
    expect(passQuestions(c, 0)).toBe(2);
  });
  it("books a pass to the Lagos date it started", () => {
    expect(lagosDay("2026-10-30T23:30:00Z")).toBe("2026-10-31");
    expect(lagosDay("2026-10-30T22:59:00Z")).toBe("2026-10-30");
  });
});
