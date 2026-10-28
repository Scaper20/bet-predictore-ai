import { describe, expect, it } from "vitest";
import { ageText, byDay, change, channelOf, hitRate, hoursBetween, lagosDay, lastDays, rank, sumBetween } from "./admin-metrics";

const NOW = Date.parse("2026-10-28T09:00:00Z");

describe("lagosDay", () => {
  it("reads the date in Lagos, an hour ahead of UTC", () => {
    expect(lagosDay("2026-10-27T23:30:00Z")).toBe("2026-10-28");
    expect(lagosDay("2026-10-27T22:30:00Z")).toBe("2026-10-27");
  });
});

describe("lastDays", () => {
  it("lists n days, oldest first, ending today", () => {
    expect(lastDays(3, NOW)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });
});

describe("byDay", () => {
  const rows = [
    { at: "2026-10-28T08:00:00Z", v: 500 },
    { at: "2026-10-27T23:30:00Z", v: 200 }, // the 28th in Lagos
    { at: "2026-10-26T10:00:00Z", v: 100 },
    { at: "2026-09-01T10:00:00Z", v: 999 }, // outside the window
  ];
  it("sums each Lagos day and fills empty days with zero", () => {
    expect(byDay(rows, (r) => r.at, (r) => r.v, 3, NOW)).toEqual([
      { day: "2026-10-26", value: 100 },
      { day: "2026-10-27", value: 0 },
      { day: "2026-10-28", value: 700 },
    ]);
  });
  it("counts rows when no value is given", () => {
    expect(byDay(rows, (r) => r.at, undefined, 3, NOW).map((p) => p.value)).toEqual([1, 0, 2]);
  });
});

describe("change", () => {
  it("is relative to the earlier period", () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(50, 100)).toBeCloseTo(-0.5);
  });
  it("has no answer from a zero base, except zero to zero", () => {
    expect(change(10, 0)).toBeNull();
    expect(change(0, 0)).toBe(0);
  });
});

describe("sumBetween", () => {
  it("includes the start and excludes the end", () => {
    const rows = [{ at: "2026-10-01T00:00:00Z" }, { at: "2026-10-02T00:00:00Z" }];
    expect(sumBetween(rows, (r) => r.at, Date.parse("2026-10-01T00:00:00Z"), Date.parse("2026-10-02T00:00:00Z"))).toBe(1);
  });
});

describe("hitRate", () => {
  it("ignores pushes and has no rate with nothing graded", () => {
    expect(hitRate(3, 1)).toBe(0.75);
    expect(hitRate(0, 0)).toBeNull();
  });
});

describe("channelOf", () => {
  it("prefers the tagged source", () => {
    expect(channelOf({ signup_utm_source: "twitter", signup_referrer_host: "www.google.com" })).toBe("X");
    expect(channelOf({ signup_utm_source: "WhatsApp" })).toBe("WhatsApp");
    expect(channelOf({ signup_utm_source: "chatgpt.com" })).toBe("AI assistants");
  });
  it("falls back to the referring host", () => {
    expect(channelOf({ signup_referrer_host: "www.google.com.ng" })).toBe("Google");
    expect(channelOf({ signup_referrer_host: "t.co" })).toBe("X");
    expect(channelOf({ signup_referrer_host: "com.twitter.android" })).toBe("X");
    expect(channelOf({ signup_referrer_host: "l.facebook.com" })).toBe("Facebook");
    expect(channelOf({ signup_referrer_host: "chatgpt.com" })).toBe("AI assistants");
    expect(channelOf({ signup_referrer_host: "nairaland.com" })).toBe("nairaland.com");
  });
  it("calls our own hosts and no attribution direct", () => {
    expect(channelOf({ signup_referrer_host: "kiqstat.app" })).toBe("Direct");
    expect(channelOf({ signup_referrer_host: "accounts.google.com" })).toBe("Direct");
    expect(channelOf({})).toBe("Direct");
  });
  it("puts partner signups in their own channel", () => {
    expect(channelOf({ referred_by_partner: "abc", signup_utm_source: "twitter" })).toBe("Partners");
  });
});

describe("rank", () => {
  it("counts and sorts, largest first, ties by name", () => {
    expect(rank(["b", "a", "b", "c", "a", "b"], (x) => x, 2)).toEqual([
      { label: "b", value: 3 },
      { label: "a", value: 2 },
    ]);
  });
});

describe("age", () => {
  it("measures and writes hours and days", () => {
    expect(hoursBetween("2026-10-27T09:00:00Z", NOW)).toBe(24);
    expect(ageText(5)).toBe("5h");
    expect(ageText(26)).toBe("1d 2h");
    expect(ageText(48)).toBe("2d");
  });
});
