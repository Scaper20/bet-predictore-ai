import { describe, expect, it } from "vitest";
import { askConfig } from "./config";

describe("askConfig", () => {
  it("defaults to how production runs today, with the guard only observing", () => {
    const c = askConfig({});
    expect(c).toMatchObject({ model: "claude-haiku-5-5", maxTokens: 8000, maxRounds: 6, effort: "medium", guard: "observe", passDaily: null });
    expect(c.requestCeilingMicros).toBe(20_000);
    expect(c.dailyCapMicros.pro).toBe(40_000);
    expect(c.label).toBe("haiku-5-5/8000/6/medium");
  });
  it("reads test settings and clamps nonsense", () => {
    const c = askConfig({ ASK_MAX_TOKENS: "1500", ASK_MAX_ROUNDS: "40", ASK_EFFORT: "low", ASK_GUARD: "enforce", ASK_REQUEST_CEILING_USD: "0.01", ASK_DAILY_CAP_USD_VIP: "abc", ASK_PASS_DAILY: "30" });
    expect(c).toMatchObject({ maxTokens: 1500, maxRounds: 10, effort: "low", guard: "enforce", requestCeilingMicros: 10_000, passDaily: 30 });
    expect(c.dailyCapMicros.vip).toBe(100_000);
  });
  it("lets the lab override one run's settings", () => {
    expect(askConfig({}, { maxTokens: 1200, maxRounds: 4, effort: "low" }).label).toBe("haiku-5-5/1200/4/low");
  });
});
