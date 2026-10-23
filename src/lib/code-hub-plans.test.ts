import { describe, expect, it } from "vitest";
import { ALLOWANCE_WINDOW_MS, allowanceState, weeklyCodeAllowance } from "./code-hub-plans";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe("weeklyCodeAllowance", () => {
  it("gives codes to Pro and VIP only", () => {
    expect(weeklyCodeAllowance("free")).toBe(0);
    expect(weeklyCodeAllowance("pass")).toBe(0);
    expect(weeklyCodeAllowance("pro")).toBe(2);
    expect(weeklyCodeAllowance("vip")).toBe(6);
  });
});

describe("allowanceState", () => {
  it("counts only codes from the last seven days", () => {
    expect(allowanceState("pro", [NOW - 8 * DAY, NOW - DAY], NOW)).toMatchObject({ used: 1, remaining: 1, nextFreeAt: null });
  });

  it("says when a slot frees once the allowance is spent", () => {
    const s = allowanceState("pro", [NOW - DAY, NOW - 3 * DAY], NOW);
    expect(s).toMatchObject({ used: 2, remaining: 0 });
    expect(s.nextFreeAt).toBe(NOW - 3 * DAY + ALLOWANCE_WINDOW_MS);
  });

  it("frees the right slot when more were given than the plan allows now", () => {
    // Downgraded from VIP to Pro mid-week with five codes in the window: the
    // member waits until only one is left in it.
    const given = [1, 2, 3, 4, 5].map((d) => NOW - d * DAY);
    expect(allowanceState("pro", given, NOW).nextFreeAt).toBe(NOW - 2 * DAY + ALLOWANCE_WINDOW_MS);
  });

  it("never offers a free plan a slot", () => {
    expect(allowanceState("free", [], NOW)).toEqual({ allowance: 0, used: 0, remaining: 0, nextFreeAt: null });
  });
});
