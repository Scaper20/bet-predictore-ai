import { describe, expect, it } from "vitest";
import { dayPassExpiry, firstSeenFrom, formatLeft, offerDeadline } from "./day-pass";

const H = 3_600_000;

describe("firstSeenFrom", () => {
  const now = 1_800_000_000_000;
  it("reads a past epoch", () => expect(firstSeenFrom(String(now - H), now)).toBe(now - H));
  it("treats 0, junk, missing and future values as no first visit", () => {
    expect(firstSeenFrom("0", now)).toBeNull();
    expect(firstSeenFrom("abc", now)).toBeNull();
    expect(firstSeenFrom(undefined, now)).toBeNull();
    expect(firstSeenFrom(String(now + H), now)).toBeNull();
  });
});

describe("offerDeadline", () => {
  it("opens at the earlier of first visit and account creation", () => {
    expect(offerDeadline(1000, 5000)).toBe(1000 + 24 * H);
    expect(offerDeadline(9000, 5000)).toBe(5000 + 24 * H);
  });
  it("uses whichever is known", () => {
    expect(offerDeadline(null, 5000)).toBe(5000 + 24 * H);
    expect(offerDeadline(1000, null)).toBe(1000 + 24 * H);
  });
  it("has no window for a returning visitor with no account", () => {
    expect(offerDeadline(null, null)).toBeNull();
  });
  it("gives an old account no window even with a fresh cookie", () => {
    const old = 0;
    expect(offerDeadline(100 * H, old)).toBe(24 * H);
  });
});

describe("dayPassExpiry and formatLeft", () => {
  it("runs 24 hours from payment", () => {
    expect(dayPassExpiry(new Date(0)).getTime()).toBe(24 * H);
  });
  it("formats hours and minutes", () => {
    expect(formatLeft(23 * H + 14 * 60_000 + 5000)).toBe("23h 14m");
    expect(formatLeft(9 * 60_000)).toBe("9m");
    expect(formatLeft(-5)).toBe("0m");
  });
});
