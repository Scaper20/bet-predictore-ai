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

  it("marks a pick we don't read as unreadable rather than guessing", () => {
    const games = gamesFromTicket([
      { eventId: "sr:match:1", marketId: "45", outcomeId: "276", homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: "1:0", marketDesc: "Correct Score", odds: 7 },
    ]);
    expect(games[0].market).toBeNull();
  });
});

describe("scoreCode", () => {
  const game = (probability: number | null, price: number | null): ScoredGame => ({
    eventId: "sr:match:1", market: "1x2:home", homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: null,
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
    expect([0.7, 0.65, 0.5, 0.44, null].map(verdictFor)).toEqual(["strong", "strong", "fair", "risky", "unreadable"]);
  });
});

describe("lockGames", () => {
  const g = (matchId: string, probability: number): ScoredGame => ({
    eventId: matchId, market: "1x2:home", homeName: "A", awayName: "B", kickoff: 1, tournamentId: null, desc: null,
    price: 1.5, builder: false, matchId, leagueCode: "x", probability, label: "A", verdict: verdictFor(probability),
  });

  it("hides the chance of a locked game, and with it the code's", () => {
    const out = lockGames([g("open", 0.7), g("pro", 0.6)], (x) => x.matchId === "pro");
    expect(out[0]).toMatchObject({ probability: 0.7, verdict: "strong" });
    expect(out[1]).toMatchObject({ probability: null, verdict: "locked" });
    expect(scoreCode(out).chance).toBeNull();
  });
});
