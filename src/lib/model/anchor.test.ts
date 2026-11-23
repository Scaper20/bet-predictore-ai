import { describe, expect, it } from "vitest";
import type { Match, ResultRow } from "@/lib/types";
import { buildPrediction } from "./predict";
import { marketGoals } from "./market-goals";
import { boardPrices } from "@/lib/odds/anchor-shadow";

const TEAMS = ["Aces", "Bees", "Cubs", "Dons", "Eels", "Fox", "Gulls", "Hawks"];
const RESULTS: ResultRow[] = (() => {
  const rows: ResultRow[] = [];
  let day = Date.parse("2026-08-01");
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let round = 0; round < 3; round++)
    for (let i = 0; i < TEAMS.length; i++)
      for (let j = 0; j < TEAMS.length; j++) {
        if (i === j) continue;
        rows.push({ homeId: TEAMS[i], awayId: TEAMS[j], homeName: TEAMS[i], awayName: TEAMS[j], homeGoals: Math.floor(rnd() * 3.2), awayGoals: Math.floor(rnd() * 2.4), date: (day += 3600_000), leagueId: "x" });
      }
  return rows;
})();

const match: Match = {
  id: "t:anchor",
  kickoff: "2026-12-05T15:00:00Z",
  status: "scheduled",
  league: { id: "x", name: "Test League", code: "test-league" },
  home: { id: "Aces", name: "Aces", shortName: "Aces" },
  away: { id: "Bees", name: "Bees", shortName: "Bees" },
  score: { home: null, away: null },
  source: "football-data",
};

describe("anchoring to the price", () => {
  // A board in sportybet_price_history's shape: 1X2 under "1|", over/under 2.5 under "18|total=2.5".
  const board = boardPrices({ "1|": { "1": [1.6, 0.6], "2": [4.0, 0.24], "3": [5.5, 0.17] }, "18|total=2.5": { "12": [1.7, 0.56], "13": [2.15, 0.44] } })!;
  const rates = marketGoals(board.oneXTwo, board.overUnder)!;

  it("moves each side's expected goals halfway, in logs, toward the price's", () => {
    const plain = buildPrediction(match, RESULTS);
    const anchored = buildPrediction(match, RESULTS, [], { marketRates: rates, marketRatesWeight: 0.5 });
    const { home: h0, away: a0 } = plain.markets.expectedGoals;
    const { home: h1, away: a1 } = anchored.markets.expectedGoals;
    expect(h1).toBeCloseTo(Math.sqrt(h0 * rates[0]), 2);
    expect(a1).toBeCloseTo(Math.sqrt(a0 * rates[1]), 2);
  });

  it("brings the result chances closer to the price's", () => {
    const fair = 1 / 1.6 / (1 / 1.6 + 1 / 4 + 1 / 5.5);
    const plain = buildPrediction(match, RESULTS).markets.home;
    const anchored = buildPrediction(match, RESULTS, [], { marketRates: rates, marketRatesWeight: 0.5 }).markets.home;
    expect(Math.abs(anchored - fair)).toBeLessThan(Math.abs(plain - fair));
  });
});
