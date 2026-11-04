import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/sportybet-player-props.json";
import { parseEventMarkets } from "./sportybet-api";
import { bookingSelection, impliedChance, matchPlayer, parsePlayerLines, sameClub, splitPlayer } from "./player-lines";
import { fromRaw, offeredOn, priceOn, toSportyBet } from "./markets";

// A real capture: GET /factsCenter/event, Atletico Madrid v Bayern Munich, 3 Nov 2026 (trimmed).
const markets = parseEventMarkets(fixture)!;
const { lines, skipped } = parsePlayerLines(markets);
const of = (market: string, player: string) => lines.filter((l) => l.market === market && l.playerName === player).sort((a, b) => a.line - b.line);

describe("SportyBet player markets (real capture)", () => {
  it("reads every player market it maps, nothing skipped", () => {
    expect(markets.length).toBeGreaterThan(20);
    expect(skipped).toBe(0);
    expect(new Set(lines.map((l) => l.market))).toEqual(
      new Set(["goals", "assists", "shots", "shotsOnTarget", "passes", "tackles", "fouls", "saves", "goalsAssists"]),
    );
  });

  it("thresholds become over lines, names are put in order and the club split off", () => {
    const kane = of("shots", "Harry Kane");
    expect(kane.map((l) => l.line)).toEqual([2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    expect(kane[0]).toMatchObject({ playerId: "108579", teamName: "Bayern Munich", platformMarket: "776", underOdds: null, underOutcome: null });
    expect(kane[0].overOdds).toBeGreaterThan(1);
    expect(of("passes", "Harry Kane")[0].line).toBe(25.5);
    expect(of("shots", "Koke")[0]).toMatchObject({ line: 0.5, teamName: "Atletico Madrid", overOdds: 1.8 });
  });

  it("splits the all-player markets by player id", () => {
    const fouls = lines.filter((l) => l.market === "fouls");
    const players = new Set(fouls.map((l) => l.playerId));
    expect(players.size).toBeGreaterThanOrEqual(3);
    for (const l of fouls) expect(l.platformMarket).toBe("800291");
    // no two rows for the same player and line
    expect(new Set(fouls.map((l) => `${l.playerId}|${l.line}`)).size).toBe(fouls.length);
    const ga = of("goalsAssists", "Harry Kane");
    expect(ga).toHaveLength(1);
    expect(ga[0]).toMatchObject({ line: 0.5, overOdds: 1.61 });
  });

  it("uses SportyBet's own fair chance, below the price's implied chance", () => {
    const l = of("shots", "Koke")[0];
    const fair = impliedChance(l, "over")!;
    expect(fair).toBeCloseTo(0.4339, 4);
    expect(fair).toBeLessThan(1 / l.overOdds!);
  });

  it("books the exact outcome", () => {
    const l = of("fouls", lines.find((x) => x.market === "fouls")!.playerName)[0];
    const sel = fromRaw(bookingSelection(l, "over")!)!;
    expect(sel.marketId).toBe("800291");
    expect(sel.outcomeId).toBe(l.overOutcome);
    expect(sel.specifier).toBeUndefined();
  });

  it("every selection is one the booking route finds on the event, at the listed price", () => {
    for (const l of lines) {
      const sel = toSportyBet(bookingSelection(l, "over")!);
      expect(sel).not.toBeNull();
      expect(offeredOn(sel!, markets)).toBe(true);
      expect(priceOn(sel!, markets)).toBe(l.overOdds);
    }
  });

  it("matches the bookmaker's names to a squad", () => {
    const squad = [
      { id: "kane", name: "Harry Kane" }, { id: "koke", name: "Koke" }, { id: "grim", name: "Alejandro Grimaldo" },
      { id: "tah", name: "Jonathan Tah" }, { id: "davies", name: "Alphonso Davies" },
    ];
    expect(matchPlayer(splitPlayer("Kane, Harry (Bayern Munich)").name, squad)?.id).toBe("kane");
    expect(matchPlayer(splitPlayer("Koke (Atletico Madrid)").name, squad)?.id).toBe("koke");
    expect(matchPlayer(splitPlayer("Grimaldo, Alex (Atletico Madrid)").name, squad)?.id).toBe("grim");
    expect(matchPlayer(splitPlayer("Alphonso Davies (Bayern Munich)").name, squad)?.id).toBe("davies");
  });

  it("matches the spellings that missed on the first live run", () => {
    const squad = [
      { id: "1", name: "Fredrik Sjøvold" }, { id: "2", name: "Odin Lurås Bjørtuft" }, { id: "3", name: "Kasper Jørgensen" },
      { id: "4", name: "Evan N'Dicka" }, { id: "5", name: "Mykola Matviyenko" }, { id: "6", name: "Fredrik André Bjørkan" },
    ];
    expect(matchPlayer("Fredrik Sjovold", squad)?.id).toBe("1");
    expect(matchPlayer("Odin Bjortuft", squad)?.id).toBe("2");
    expect(matchPlayer("Odin Luras Bjortuft", squad)?.id).toBe("2");
    expect(matchPlayer("Kasper Jorgensen", squad)?.id).toBe("3");
    expect(matchPlayer("Evan Ndicka", squad)?.id).toBe("4");
    expect(matchPlayer("Mykola Matvienko", squad)?.id).toBe("5");
    expect(matchPlayer("Fredrik Bjorkan", squad)?.id).toBe("6");
    // close spellings never merge two different surnames that both exist
    expect(matchPlayer("Someone Matvienko", [...squad, { id: "7", name: "Ivan Matvienko" }])?.id).toBe("7");
  });

  it("uses the club to tell two players with the same surname apart", () => {
    const squad = [
      { id: "a", name: "Lucas Hernández", team: "Paris Saint-Germain" },
      { id: "b", name: "Theo Hernández", team: "AC Milan" },
    ];
    expect(matchPlayer("Hernandez", squad)).toBeNull();
    expect(matchPlayer("Hernandez", squad, "Paris SG")?.id).toBe("a");
    expect(matchPlayer("Hernandez", squad, "Milan")?.id).toBe("b");
    expect(sameClub("Atletico Madrid", "Atlético de Madrid")).toBe(true);
    expect(sameClub("Bayern Munich", "FC Bayern München")).toBe(true);
    expect(sameClub("Bayern Munich", "Atletico Madrid")).toBe(false);
  });
});
