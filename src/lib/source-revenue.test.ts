import { describe, expect, it } from "vitest";
import { DIRECT, NO_DATA, revenueBySource, sourceLabel, type SourceProfile } from "./source-revenue";

const p = (id: string, extra: Partial<SourceProfile> = {}): SourceProfile => ({
  id,
  email: `${id}@gmail.com`,
  signupLandingPage: "/",
  referrerHost: null,
  utmSource: null,
  utmMedium: null,
  ...extra,
});

describe("sourceLabel", () => {
  it("keeps a missing capture apart from direct traffic", () => {
    expect(sourceLabel(p("a", { signupLandingPage: null }))).toBe(NO_DATA);
    expect(sourceLabel(p("a"))).toBe(DIRECT);
  });
  it("prefers a tagged link over the referrer", () => {
    expect(sourceLabel(p("a", { referrerHost: "t.co", utmSource: "x", utmMedium: "post" }))).toBe("x / post");
    expect(sourceLabel(p("a", { referrerHost: "chatgpt.com" }))).toBe("chatgpt.com");
  });
});

describe("revenueBySource", () => {
  const profiles = [
    p("a", { referrerHost: "chatgpt.com" }),
    p("b", { referrerHost: "chatgpt.com" }),
    p("c", { referrerHost: "t.co" }),
    p("d", { signupLandingPage: null }),
    p("staff", { email: "me@kiqstat.app", referrerHost: "t.co" }),
  ];
  const orders = [
    { userId: "a", naira: 5000 },
    { userId: "a", naira: 5000 },
    { userId: "c", naira: 12000 },
    { userId: "staff", naira: 500 },
    { userId: "ghost", naira: 999 },
    { userId: null, naira: 1 },
  ];
  const rows = revenueBySource(profiles, orders);

  it("ranks sources by what they paid", () => {
    expect(rows.map((r) => r.source)).toEqual(["t.co", "chatgpt.com", NO_DATA]);
    expect(rows[0]).toMatchObject({ signups: 1, payers: 1, orders: 1, naira: 12000, conversion: 1 });
    expect(rows[1]).toMatchObject({ signups: 2, payers: 1, orders: 2, naira: 10000, conversion: 0.5 });
  });
  it("leaves staff accounts and unknown payers out", () => {
    expect(rows.reduce((s, r) => s + r.naira, 0)).toBe(22000);
    expect(rows.reduce((s, r) => s + r.signups, 0)).toBe(4);
  });
});
