import { describe, expect, it } from "vitest";
import { DAY_MS, evaluateWatch, lagosDay, type WatchQuestion } from "./watch";

const NOW = Date.parse("2026-11-10T09:00:00Z");
const capUsd = (t: string) => ({ pro: 0.04, vip: 0.1, free: 0.01 })[t as "pro" | "vip" | "free"] ?? 0.01;
const q = (daysAgo: number, usd: number, extra: Partial<WatchQuestion> = {}): WatchQuestion => ({
  userId: "user-aaaaaaaa",
  tier: "pro",
  at: NOW - daysAgo * DAY_MS,
  usd,
  outcome: "answered",
  ...extra,
});
const run = (questions: WatchQuestion[], revenue = 100_000) => evaluateWatch({ now: NOW, questions, revenue30dNaira: revenue, nairaPerUsd: 1550, capUsd });

describe("lagosDay", () => {
  it("rolls over at 23:00 UTC", () => {
    expect(lagosDay(Date.parse("2026-11-10T22:59:00Z"))).toBe("2026-11-10");
    expect(lagosDay(Date.parse("2026-11-10T23:00:00Z"))).toBe("2026-11-11");
  });
});

describe("evaluateWatch", () => {
  it("is quiet for ordinary use", () => {
    expect(run(Array.from({ length: 30 }, (_, i) => q(i + 0.5, 0.001)))).toEqual([]);
  });

  it("flags Ask spend as a share of revenue", () => {
    // $6.50 of spend against ₦100,000 ($64.5): 10%.
    expect(run([q(3, 6.5)]).map((x) => x.key)).toContain("margin:warn");
    expect(run([q(3, 13)]).find((x) => x.key.startsWith("margin"))?.severity).toBe("critical");
  });

  it("flags spend when nothing was collected", () => {
    expect(run([q(3, 2.5)], 0).map((x) => x.key)).toContain("margin:norevenue");
    expect(run([q(3, 0.5)], 0)).toEqual([]);
  });

  it("flags an account at its cap most days", () => {
    expect(run([1, 2, 3].map((d) => q(d + 0.4, 0.035))).some((x) => x.key.startsWith("nearcap:"))).toBe(true);
    expect(run([1, 2].map((d) => q(d + 0.4, 0.035))).some((x) => x.key.startsWith("nearcap:"))).toBe(false);
  });

  it("flags a spike against the account's own history", () => {
    const history = Array.from({ length: 10 }, (_, i) => q(i + 2.4, 0.002));
    expect(run([...history, q(0.9, 0.05)]).some((x) => x.key.startsWith("spike:"))).toBe(true);
    expect(run([...history, q(0.9, 0.01)]).some((x) => x.key.startsWith("spike:"))).toBe(false);
  });

  it("flags a question that costs twice what it did", () => {
    const base = Array.from({ length: 12 }, (_, i) => q(2 + i * 0.1, 0.001, { userId: `u${i}` }));
    const dear = Array.from({ length: 12 }, (_, i) => q(0.9 + i * 0.01, 0.003, { userId: `v${i}` }));
    expect(run([...base, ...dear]).some((x) => x.key.startsWith("cpq:"))).toBe(true);
  });

  it("flags a day of failures and cancels", () => {
    const day = Array.from({ length: 12 }, (_, i) => q(0.9, 0.001, { userId: `u${i}`, outcome: i < 4 ? "aborted" : "answered" }));
    expect(run(day).find((x) => x.key.startsWith("fail:"))?.severity).toBe("critical");
    expect(run(day.map((x) => ({ ...x, outcome: "answered" }))).some((x) => x.key.startsWith("fail:"))).toBe(false);
  });
});
