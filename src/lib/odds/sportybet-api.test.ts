import { describe, expect, it } from "vitest";
import upcoming from "./__fixtures__/sportybet-upcoming.json";
import share from "./__fixtures__/sportybet-share.json";
import resultsFixture from "./__fixtures__/sportybet-results.json";
import {
  builderRequest,
  parseBuilderQuote,
  parseEventResult,
  parseResults,
  parseShareResponse,
  parseTournamentList,
  parseUpcoming,
  scoreVerdict,
  shareRequest,
} from "./sportybet-api";
import { matchesSelection, toSportyBet } from "./markets";

describe("parseUpcoming", () => {
  it("reads events with their competitor ids and tournament", () => {
    const page = parseUpcoming(upcoming)!;
    expect(page.totalNum).toBe(3);
    expect(page.events).toHaveLength(3);
    const [first] = page.events;
    expect(first).toMatchObject({
      eventId: "sr:match:72221344",
      homeName: "Ipswich Town",
      awayName: "Nottingham Forest",
      homeId: "sr:competitor:32",
      awayId: "sr:competitor:14",
      tournamentId: "sr:tournament:17",
      kickoff: 1792782000000,
    });
  });

  it("keeps markets in the board shape the price lookup already reads", () => {
    const [, villa] = parseUpcoming(upcoming)!.events;
    const over = toSportyBet("ou:over:2.5")!;
    const entry = villa.markets.find((m) => matchesSelection(m, over));
    expect(entry?.outcomes?.find((o) => o.id === over.outcomeId)?.odds).toMatch(/^\d+\.\d+$/);
    const ah = toSportyBet("ah:home:-0.5")!;
    expect(villa.markets.some((m) => matchesSelection(m, ah))).toBe(true);
  });

  it("drops an outcome SportyBet marks inactive", () => {
    const [first] = parseUpcoming(upcoming)!.events;
    const x12 = first.markets.find((m) => m.market_id === "1")!;
    expect(x12.outcomes!.map((o) => o.id)).toEqual(["1", "3"]);
  });

  it("refuses a failed response and drops malformed events", () => {
    expect(parseUpcoming({ bizCode: 19999, message: "nope" })).toBeNull();
    expect(parseUpcoming("<html>403</html>")).toBeNull();
    const page = parseUpcoming({
      bizCode: 10000,
      data: {
        totalNum: 2,
        tournaments: [
          {
            id: "sr:tournament:1",
            events: [
              { eventId: "53452525", homeTeamName: "A", awayTeamName: "B", estimateStartTime: 1 },
              { eventId: "sr:match:2", homeTeamName: "A", awayTeamName: "", estimateStartTime: 1 },
            ],
          },
        ],
      },
    });
    expect(page?.events).toEqual([]);
  });
});

describe("parseShareResponse", () => {
  it("reads a booked code", () => {
    expect(parseShareResponse(share, 2)).toEqual({
      bookingCode: "G6X11U",
      shareUrl: "https://www.sportybet.com/ng/?shareCode=G6X11U",
      deadline: 1793800800000,
      selectionsCount: 2,
    });
  });

  it("refuses a code that lost a leg", () => {
    expect(parseShareResponse(share, 3)).toBeNull();
    const lost = structuredClone(share);
    lost.data.unavailableOutcomes = [{ eventId: "sr:match:72221346" }] as never;
    expect(parseShareResponse(lost, 2)).toBeNull();
  });

  it("refuses SportyBet's failure envelope", () => {
    expect(
      parseShareResponse({ bizCode: 19999, isAvailable: false, message: "Sorry, something went wrong." }, 1),
    ).toBeNull();
    expect(parseShareResponse({ bizCode: 19000, message: "The code is invalid." }, 1)).toBeNull();
  });
});

describe("shareRequest", () => {
  it("sends a null specifier rather than leaving it out", () => {
    expect(
      shareRequest([
        { eventId: "sr:match:1", marketId: "1", outcomeId: "1" },
        { eventId: "sr:match:2", marketId: "18", outcomeId: "12", specifier: "total=2.5" },
      ]),
    ).toEqual({
      selections: [
        { eventId: "sr:match:1", marketId: "1", specifier: null, outcomeId: "1" },
        { eventId: "sr:match:2", marketId: "18", specifier: "total=2.5", outcomeId: "12" },
      ],
    });
  });
});

describe("parseTournamentList", () => {
  it("flattens categories into tournaments", () => {
    expect(
      parseTournamentList({
        bizCode: 10000,
        data: [
          {
            id: "sr:sport:1",
            categories: [
              { name: "Algeria", tournaments: [{ id: "sr:tournament:841", name: "Ligue 1", eventSize: 7 }] },
            ],
          },
        ],
      }),
    ).toEqual([{ id: "sr:tournament:841", name: "Ligue 1", category: "Algeria", eventSize: 7 }]);
  });
});

describe("parseResults and scoreVerdict", () => {
  it("reads ended games with their final and half-time scores", () => {
    const results = parseResults(resultsFixture);
    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({ eventId: "sr:match:74173018", setScore: "1:4", halves: ["1:1", "0:3"], void: false });
  });

  it("confirms the same score and flags a different one", () => {
    const [omonia] = parseResults(resultsFixture);
    expect(scoreVerdict({ home: 1, away: 4 }, omonia)).toBe("confirmed");
    expect(scoreVerdict({ home: 4, away: 1 }, omonia)).toBe("mismatch");
  });

  it("accepts a ninety-minute score against a result after extra time", () => {
    const aet = { eventId: "sr:match:1", setScore: "2:1", halves: ["1:0", "0:1", "1:0", "0:0"], void: false };
    expect(scoreVerdict({ home: 1, away: 1 }, aet)).toBe("confirmed");
    expect(scoreVerdict({ home: 2, away: 1 }, aet)).toBe("confirmed");
    expect(scoreVerdict({ home: 0, away: 0 }, aet)).toBe("mismatch");
  });

  it("takes an ended game whether or not SportyBet has settled it yet", () => {
    const ended = { bizCode: 10000, data: { eventId: "sr:match:3", status: 3, matchStatus: "Ended", setScore: "1:0", gameScore: ["1:0", "0:0"] } };
    expect(parseEventResult(ended)?.setScore).toBe("1:0");
  });

  it("marks a called-off game void and skips one still running", () => {
    expect(parseEventResult({ bizCode: 10000, data: { eventId: "sr:match:2", status: 0, matchStatus: "Postponed" } })).toEqual({
      eventId: "sr:match:2",
      setScore: null,
      halves: [],
      void: true,
    });
    expect(parseEventResult({ bizCode: 10000, data: { eventId: "sr:match:2", status: 1, setScore: "1:0", matchStatus: "H1" } })).toBeNull();
    expect(parseResults({ bizCode: 19999, data: {} })).toEqual([]);
  });
});

describe("Bet Builder pricing", () => {
  it("addresses each part by its Sportradar URN with SportyBet's odds and probability", () => {
    expect(
      builderRequest("sr:match:1", [
        { selection: { eventId: "sr:match:1", marketId: "1", outcomeId: "1" }, odds: "3.15", probability: "0.30" },
        { selection: { eventId: "sr:match:1", marketId: "18", outcomeId: "12", specifier: "total=2.5" }, odds: "1.72", probability: "0.56" },
      ]),
    ).toEqual({
      eventId: "sr:match:1",
      selections: [
        { id: "uof:3/sr:sport:1/1/1?", odds: "3.15", probability: "0.30" },
        { id: "uof:3/sr:sport:1/18/12?total=2.5", odds: "1.72", probability: "0.56" },
      ],
    });
  });

  it("reads the parent market id, and a refusal to combine", () => {
    // Shapes as SportyBet answered on 23 Oct (Coventry v Fulham, Home + Over 2.5 + GG).
    expect(
      parseBuilderQuote({ bizCode: 10000, data: { odds: "5.65", probability: "0.17", marketId: "261023165047bb54301940", outcomeId: "1", valid: true } }),
    ).toEqual({ valid: true, parentMarketId: "261023165047bb54301940", odds: 5.65 });
    expect(parseBuilderQuote({ bizCode: 10000, data: { odds: "0.00", marketId: "261023165138bb54311142", valid: false } })).toEqual({ valid: false });
    expect(parseBuilderQuote({ http: 500 })).toBeNull();
  });

  it("puts the parent id on each part of the share request", () => {
    expect(
      shareRequest([{ eventId: "sr:match:1", marketId: "29", outcomeId: "74", parentBetBuilderMarketId: "bb1" }]).selections[0],
    ).toEqual({ eventId: "sr:match:1", marketId: "29", specifier: null, outcomeId: "74", parentBetBuilderMarketId: "bb1" });
  });
});
