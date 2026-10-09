import { describe, expect, it } from "vitest";
import { parseBookingResponse, parseKickoff, parseListing, planBooking, type BookableLeg } from "./booking";

const leg = (matchId: string, market: string): BookableLeg => ({
  matchId,
  homeName: "Arsenal",
  awayName: "Chelsea",
  kickoff: 1_800_000_000_000,
  market,
});

describe("planBooking", () => {
  it("maps each leg to SportyBet's address with the matched event", () => {
    const plan = planBooking(
      [leg("a", "1x2:home"), leg("b", "ou:over:2.5")],
      new Map([["a", "sr:match:1"], ["b", "sr:match:2"]]),
    );
    expect(plan.selections).toEqual([
      { eventId: "sr:match:1", marketId: "1", outcomeId: "1" },
      { eventId: "sr:match:2", marketId: "18", outcomeId: "12", specifier: "total=2.5" },
    ]);
    expect(plan.matchIds).toEqual(["a", "b"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips and reports legs it cannot address or find instead of guessing", () => {
    const plan = planBooking(
      [leg("a", "cs:2-1"), leg("b", "1x2:draw"), leg("c", "btts:yes")],
      new Map([["a", "sr:match:1"], ["c", "sr:match:3"]]),
    );
    expect(plan.selections).toEqual([{ eventId: "sr:match:3", marketId: "29", outcomeId: "74" }]);
    expect(plan.skipped).toEqual([
      { matchId: "a", reason: "unsupported-market" },
      { matchId: "b", reason: "not-listed" },
    ]);
  });

  it("books one selection per match", () => {
    const plan = planBooking(
      [leg("a", "1x2:home"), leg("a", "1x2:away")],
      new Map([["a", "sr:match:1"]]),
    );
    expect(plan.selections).toHaveLength(1);
    expect(plan.selections[0].outcomeId).toBe("1");
  });
});

describe("parseKickoff", () => {
  it("accepts ms, seconds, numeric strings and ISO dates", () => {
    expect(parseKickoff(1_800_000_000_000)).toBe(1_800_000_000_000);
    expect(parseKickoff(1_800_000_000)).toBe(1_800_000_000_000);
    expect(parseKickoff("1800000000000")).toBe(1_800_000_000_000);
    expect(parseKickoff("2027-01-15T08:00:00Z")).toBe(Date.parse("2027-01-15T08:00:00Z"));
  });

  it("refuses anything else", () => {
    expect(parseKickoff("soon")).toBeNull();
    expect(parseKickoff("")).toBeNull();
    expect(parseKickoff(null)).toBeNull();
    expect(parseKickoff(Number.NaN)).toBeNull();
  });
});

describe("parseListing", () => {
  it("reads events from the wrapped or bare payload and drops unusable rows", () => {
    const events = [
      { eventId: "sr:match:1", homeTeamName: "A", awayTeamName: "B", kickoffTime: 1_800_000_000_000 },
      { eventId: "sr:match:2", homeTeamName: "C", awayTeamName: "D", kickoffTime: "garbage" },
      { homeTeamName: "E", awayTeamName: "F", kickoffTime: 1_800_000_000_000 },
    ];
    const expected = [{ eventId: "sr:match:1", homeName: "A", awayName: "B", kickoff: 1_800_000_000_000 }];
    expect(parseListing({ status: "success", data: { events } })).toEqual(expected);
    expect(parseListing({ events })).toEqual(expected);
    expect(parseListing(null)).toEqual([]);
  });
});

describe("parseBookingResponse", () => {
  it("reads the code, link, deadline and declined events", () => {
    const body = {
      status: "success",
      data: {
        shareCode: "n4c1zd",
        shareURL: "https://www.sportybet.com/ng/?shareCode=N4C1ZD",
        deadline: 1_800_000_000_000,
        unavailableOutcomes: [{ eventId: "sr:match:9" }],
      },
    };
    expect(parseBookingResponse(body)).toEqual({
      code: "N4C1ZD",
      url: "https://www.sportybet.com/ng/?shareCode=N4C1ZD",
      deadline: 1_800_000_000_000,
      unavailableEventIds: ["sr:match:9"],
    });
  });

  it("returns null unless there is a well-formed code", () => {
    expect(parseBookingResponse({ data: { shareURL: "x" } })).toBeNull();
    expect(parseBookingResponse({ data: { shareCode: "no good!" } })).toBeNull();
    expect(parseBookingResponse(null)).toBeNull();
  });
});
