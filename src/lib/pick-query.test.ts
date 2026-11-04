import { describe, expect, it } from "vitest";
import { ALL_PICKS, pickParams, pickSegment } from "./pick-query";

describe("pickSegment", () => {
  it("is 'all' with no filters, and ignores other params", () => {
    expect(pickSegment(new URLSearchParams("utm_source=x&ref=abc"))).toBe(ALL_PICKS);
  });
  it("writes known filters in a fixed order", () => {
    expect(pickSegment(new URLSearchParams("sort=chance&league=premier-league&tier=strong"))).toBe("league~premier-league.tier~strong.sort~chance");
  });
  it("drops unsafe values", () => {
    expect(pickSegment(new URLSearchParams("league=../x&risk=LOW"))).toBe(ALL_PICKS);
  });
  it("round-trips", () => {
    const seg = pickSegment(new URLSearchParams("family=team-goals&risk=low"));
    expect(pickParams(seg)).toEqual({ family: "team-goals", risk: "low" });
    expect(pickParams(ALL_PICKS)).toEqual({});
  });
});
