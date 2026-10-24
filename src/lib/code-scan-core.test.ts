import { describe, expect, it } from "vitest";
import shareBuilder from "@/lib/odds/__fixtures__/sportybet-share-builder.json";
import { parseShareTicket } from "@/lib/odds/sportybet-api";
import { gamesFromTicket, lockGames, scoreCode, verdictFor, type ScoredGame } from "./code-scan-core";

describe("gamesFromTicket", () => {
  it("turns a Bet Builder into one same-game combo and keeps the rest as they are", () => {
    const games = gamesFromTicket(parseShareTicket(shareBuilder)!.legs);
    expect(games).toHaveLength(3);
    const villa = games.find((g) => g.homeName === "Aston Villa")!;
    expect(villa).toMatchObject({ builder: true, market: "combo:1x2:home+ou:over:2.5+btts:yes", price: null });
    const arsenal = games.find((g) => g.homeName === "Arsenal")!;
    expect(arsenal).toMatchObject({ builder: false, market: "combo:1x2:away+ou:over:1.5" });
    expect(arsenal.price).toBeGreaterThan(1);
    expect(games.find((g) => g.homeName === "Coventry City")?.market).toBe("btts:yes");
  });

  const leg = (marketId: string, outcomeId: string, specifier?: string, parent?: string) => ({
    eventId: "sr:match:1", marketId, outcomeId, ...(specifier ? { specifier } : {}), ...(parent ? { parentBetBuilderMarketId: parent } : {}),
    homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: "x", marketDesc: "X", odds: 2,
  });

  it("keeps a market we have no id for as SportyBet addresses it, never as unread", () => {
    const games = gamesFromTicket([
      leg("45", "276"),
      leg("60200", "1"),
      leg("450001", "12"),
      leg("21", "sr:exact_goals:6+:70", "variant=sr:exact_goals:6+"),
    ]);
    expect(games.map((g) => g.market)).toEqual([
      "raw:45::276",
      "raw:60200::1",
      "raw:450001::12",
      "raw:21:variant%3Dsr%3Aexact_goals%3A6%2B:sr%3Aexact_goals%3A6%2B%3A70",
    ]);
    expect(games[3].selections).toEqual([{ marketId: "21", outcomeId: "sr:exact_goals:6+:70", specifier: "variant=sr:exact_goals:6+" }]);
  });

  it("keeps a Bet Builder with a part we don't model as one combo", () => {
    const [g] = gamesFromTicket([leg("1", "1", undefined, "p1"), leg("60300", "74", undefined, "p1")]);
    expect(g).toMatchObject({ builder: true, market: "combo:1x2:home+raw:60300::74" });
    expect(g.selections).toHaveLength(2);
  });
});

describe("scoreCode", () => {
  const game = (probability: number | null, price: number | null): ScoredGame => ({
    eventId: "sr:match:1", market: "1x2:home", selections: [], homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: null,
    price, builder: false, matchId: "m", leagueCode: "x", probability, label: "A", verdict: verdictFor(probability),
  });

  it("multiplies chances and prices, and rates the price against the chance", () => {
    expect(scoreCode([game(0.7, 1.5), game(0.6, 1.8)])).toEqual({ chance: 0.42, odds: 2.7, fairness: 1.134, readable: 2, total: 2 });
  });

  it("gives no chance when any game is unread", () => {
    const s = scoreCode([game(0.7, 1.5), game(null, 3)]);
    expect(s.chance).toBeNull();
    expect(s.odds).toBe(4.5);
    expect(s.readable).toBe(1);
  });

  it("uses the site's risk bands", () => {
    expect([0.7, 0.65, 0.5, 0.44, null].map((p) => verdictFor(p))).toEqual(["strong", "strong", "fair", "risky", "unreadable"]);
  });

  it("never calls a chance from a bare price strong", () => {
    expect(verdictFor(0.8, "market")).toBe("strong");
    expect(verdictFor(0.8, "odds")).toBe("fair");
    expect(verdictFor(0.3, "odds")).toBe("risky");
  });
});

describe("lockGames", () => {
  const g = (matchId: string, probability: number): ScoredGame => ({
    eventId: matchId, market: "1x2:home", selections: [], homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: null,
    price: 1.5, builder: false, matchId, leagueCode: "x", probability, label: "A", verdict: verdictFor(probability),
  });

  it("hides the chance of a locked game, and with it the code's", () => {
    const out = lockGames([g("open", 0.7), g("pro", 0.6)], (x) => x.matchId === "pro");
    expect(out[0]).toMatchObject({ probability: 0.7, verdict: "strong" });
    expect(out[1]).toMatchObject({ probability: null, verdict: "locked" });
    expect(scoreCode(out).chance).toBeNull();
  });

  it("leaves SportyBet's own read open: it isn't ours to hold back", () => {
    const out = lockGames([{ ...g("pro", 0.6), source: "market" as const }], () => true);
    expect(out[0]).toMatchObject({ probability: 0.6, verdict: "fair" });
  });
});
