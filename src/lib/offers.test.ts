import { describe, expect, it } from "vitest";
import { durationLabel, earlier, firstSeenFrom, formatLeft, offerDeadline, offerLive, passExpiry } from "./offers";

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
    expect(offerDeadline(9000, 5000, 48)).toBe(5000 + 48 * H);
  });
  it("has no window for a returning visitor with no account", () => {
    expect(offerDeadline(null, null)).toBeNull();
  });
  it("gives an old account no window even with a fresh cookie", () => {
    expect(offerDeadline(100 * H, 0)).toBe(24 * H);
  });
});

describe("offerLive", () => {
  const now = 10 * H;
  it("needs the switch on and the dates around now", () => {
    expect(offerLive({ active: false, startsAt: null, endsAt: null }, now)).toBe(false);
    expect(offerLive({ active: true, startsAt: null, endsAt: null }, now)).toBe(true);
    expect(offerLive({ active: true, startsAt: new Date(11 * H).toISOString(), endsAt: null }, now)).toBe(false);
    expect(offerLive({ active: true, startsAt: null, endsAt: new Date(9 * H).toISOString() }, now)).toBe(false);
  });
});

describe("passes and labels", () => {
  it("stacks a pass on a running one", () => {
    expect(passExpiry(24, new Date(0), null).getTime()).toBe(24 * H);
    expect(passExpiry(24, new Date(0), new Date(5 * H)).getTime()).toBe(29 * H);
    expect(passExpiry(24, new Date(10 * H), new Date(5 * H)).getTime()).toBe(34 * H);
  });
  it("takes the earlier deadline", () => {
    expect(earlier(null, 3)).toBe(3);
    expect(earlier(4, 3)).toBe(3);
    expect(earlier(null, null)).toBeNull();
  });
  it("formats time left and durations", () => {
    expect(formatLeft(23 * H + 14 * 60_000 + 5000)).toBe("23h 14m");
    expect(formatLeft(9 * 60_000)).toBe("9m");
    expect(formatLeft(72 * H)).toBe("3d 0h");
    expect(durationLabel(24)).toBe("24 hours");
    expect(durationLabel(72)).toBe("3 days");
    expect(durationLabel(168)).toBe("1 week");
  });
});
