import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { planMatchesPrice } = await import("./renewable");

describe("planMatchesPrice", () => {
  it("accepts a Paystack plan charging the site's price", () => {
    expect(planMatchesPrice(1_350_000, 13_500)).toBe(true);
  });

  it("refuses the October 2026 mismatches", () => {
    expect(planMatchesPrice(950_000, 13_500)).toBe(false); // Pro 3 months
    expect(planMatchesPrice(7_680_000, 115_200)).toBe(false); // VIP yearly
  });

  it("fails closed when Paystack can't be read or there is no price", () => {
    expect(planMatchesPrice(null, 5_000)).toBe(false);
    expect(planMatchesPrice(500_000, undefined)).toBe(false);
  });
});
