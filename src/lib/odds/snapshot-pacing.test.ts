import { describe, expect, it } from "vitest";
import { oddsApiBoardDue } from "./snapshot-pacing";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 5, 12); // 5 October: ~26.5 days left

describe("oddsApiBoardDue", () => {
  it("never refreshes a competition with no games coming", () => {
    expect(oddsApiBoardDue({ boards: 20, remaining: 500, lastFetched: null, hasUpcoming: false, now })).toBe(false);
  });

  it("spreads the month's credits so they last the month", () => {
    // 460 spendable over 20 boards = 23 refreshes each over ~26.5 days: about every 27.6h.
    const base = { boards: 20, remaining: 500, hasUpcoming: true, now };
    expect(oddsApiBoardDue({ ...base, lastFetched: now - 20 * HOUR })).toBe(false);
    expect(oddsApiBoardDue({ ...base, lastFetched: now - 28 * HOUR })).toBe(true);
    expect(oddsApiBoardDue({ ...base, lastFetched: null })).toBe(true);
  });

  it("stops at the reserve", () => {
    expect(oddsApiBoardDue({ boards: 20, remaining: 40, lastFetched: null, hasUpcoming: true, now })).toBe(false);
  });

  it("never more often than every three hours, however many credits are left", () => {
    expect(oddsApiBoardDue({ boards: 1, remaining: 100_000, lastFetched: now - 2 * HOUR, hasUpcoming: true, now })).toBe(false);
    expect(oddsApiBoardDue({ boards: 1, remaining: 100_000, lastFetched: now - 3 * HOUR, hasUpcoming: true, now })).toBe(true);
  });
});
