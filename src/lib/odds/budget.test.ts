import { describe, expect, it } from "vitest";
import {
  canSpend,
  costOf,
  QUOTA_RESERVE,
  readQuota,
  refreshIntervalMs,
  UNKNOWN_QUOTA,
} from "./budget";

const HOUR = 60 * 60 * 1000;

describe("readQuota", () => {
  it("reads the meter the API reports on every response", () => {
    const headers: Record<string, string> = {
      "x-requests-remaining": "486",
      "x-requests-used": "14",
    };
    const quota = readQuota((name) => headers[name] ?? null, 1000);
    expect(quota).toEqual({ remaining: 486, used: 14, checkedAt: 1000 });
  });

  it("treats a missing or unparseable header as unknown, not as zero", () => {
    // Zero would permanently disable the feature on one malformed response.
    const quota = readQuota(() => null);
    expect(quota.remaining).toBeNull();
    expect(quota.used).toBeNull();

    expect(readQuota(() => "").remaining).toBeNull();
    expect(readQuota(() => "not a number").remaining).toBeNull();
  });
});

describe("canSpend", () => {
  it("lets the first call of a cold process through", () => {
    // Nothing has been observed yet, and refusing on unknown means the
    // response that would establish the reading is never fetched.
    expect(canSpend(UNKNOWN_QUOTA, 4)).toBe(true);
  });

  it("stops at the reserve rather than at zero", () => {
    const at = { remaining: QUOTA_RESERVE + 2, used: 0, checkedAt: 0 };
    expect(canSpend(at, 2)).toBe(true);
    expect(canSpend(at, 3)).toBe(false);
  });

  it("refuses once the reserve is already breached", () => {
    expect(canSpend({ remaining: 10, used: 490, checkedAt: 0 }, 1)).toBe(false);
    expect(canSpend({ remaining: 0, used: 500, checkedAt: 0 }, 1)).toBe(false);
  });
});

describe("refreshIntervalMs", () => {
  it("caches harder as the month tightens", () => {
    const plenty = refreshIntervalMs({ remaining: 480, used: 20, checkedAt: 0 });
    const middle = refreshIntervalMs({ remaining: 200, used: 300, checkedAt: 0 });
    const thin = refreshIntervalMs({ remaining: 80, used: 420, checkedAt: 0 });

    expect(plenty).toBe(3 * HOUR);
    expect(middle).toBe(6 * HOUR);
    expect(thin).toBe(12 * HOUR);
    expect(plenty).toBeLessThan(middle);
    expect(middle).toBeLessThan(thin);
  });

  it("assumes the middle when it has no reading", () => {
    expect(refreshIntervalMs(UNKNOWN_QUOTA)).toBe(6 * HOUR);
  });
});

describe("costOf", () => {
  it("charges per market per region, which is the API's own rule", () => {
    // Verified live: regions=eu,uk with markets=h2h,totals reported
    // x-requests-last: 4.
    expect(costOf(["h2h", "totals"], ["eu", "uk"])).toBe(4);
    expect(costOf(["h2h", "totals"], ["eu"])).toBe(2);
    expect(costOf(["h2h"], ["eu"])).toBe(1);
  });
});
