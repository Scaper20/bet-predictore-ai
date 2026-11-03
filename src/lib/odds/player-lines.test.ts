import { describe, expect, it } from "vitest";
import { bookingSelection, impliedChance, matchPlayer, parsePlayerLines, playerIdOf } from "./player-lines";
import { fromRaw } from "./markets";

const variant = "variant=pre:playerprops:74165980:830593";

describe("parsePlayerLines", () => {
  it("reads threshold outcomes as over lines", () => {
    const { lines, skipped } = parsePlayerLines([
      { market_id: "776", specifier: variant, desc: "Player shots", outcomes: [
        { id: "pre:playerprops:74165980:830593:1", odds: "1.25", desc: "Harry Kane 1+" },
        { id: "pre:playerprops:74165980:830593:3", odds: "2.10", desc: "Harry Kane 3+" },
      ] },
    ]);
    expect(skipped).toBe(0);
    expect(lines.map((l) => [l.market, l.line, l.playerName, l.overOdds, l.underOdds])).toEqual([
      ["shots", 0.5, "Harry Kane", 1.25, null],
      ["shots", 2.5, "Harry Kane", 2.1, null],
    ]);
    expect(lines[0].playerId).toBe("830593");
    expect(fromRaw(bookingSelection(lines[1], "over")!)).toEqual({ marketId: "776", specifier: variant, outcomeId: "pre:playerprops:74165980:830593:3" });
    expect(bookingSelection(lines[1], "under")).toBeNull();
  });

  it("reads over/under outcomes, line from the outcome or a total", () => {
    const { lines } = parsePlayerLines([
      { market_id: "780", specifier: variant, desc: "Joshua Kimmich", outcomes: [
        { id: "12", odds: 1.8, desc: "Over 1.5" }, { id: "13", odds: 1.95, desc: "Under 1.5" },
      ] },
      { market_id: "800297", specifier: `${variant}|total=2.5`, desc: "Manuel Neuer", outcomes: [
        { id: "12", odds: 1.7, desc: "Over" }, { id: "13", odds: 2.05, desc: "Under" },
      ] },
    ]);
    expect(lines.map((l) => [l.market, l.line, l.playerName, l.overOutcome, l.underOutcome])).toEqual([
      ["tackles", 1.5, "Joshua Kimmich", "12", "13"],
      ["saves", 2.5, "Manuel Neuer", "12", "13"],
    ]);
    const p = impliedChance(lines[0], "over")!;
    expect(p + impliedChance(lines[0], "under")!).toBeCloseTo(1, 6);
    expect(p).toBeGreaterThan(0.5);
  });

  it("ignores other markets and counts player markets it cannot read", () => {
    const { lines, skipped } = parsePlayerLines([
      { market_id: "1", outcomes: [{ id: "1", odds: 2, desc: "Home" }] },
      { market_id: "775", specifier: variant, outcomes: [{ id: "x", odds: 2, desc: "Anytime" }] },
    ]);
    expect(lines).toEqual([]);
    expect(skipped).toBe(1);
  });

  it("reads the player id from the variant", () => {
    expect(playerIdOf("variant=pre:playerprops:1:2")).toBe("2");
    expect(playerIdOf("total=1.5")).toBeNull();
  });
});

describe("matchPlayer", () => {
  const squad = [
    { id: "1", name: "Harry Kane" }, { id: "2", name: "Leroy Sané" }, { id: "3", name: "Jamal Musiala" },
    { id: "4", name: "Rodri" }, { id: "5", name: "Josip Stanišić" }, { id: "6", name: "Lucas Hernández" }, { id: "7", name: "Theo Hernández" },
  ];
  it("matches full names, accents and initials", () => {
    expect(matchPlayer("Harry Kane", squad)?.id).toBe("1");
    expect(matchPlayer("Leroy Sane", squad)?.id).toBe("2");
    expect(matchPlayer("J. Musiala", squad)?.id).toBe("3");
    expect(matchPlayer("Rodri", squad)?.id).toBe("4");
    expect(matchPlayer("Stanisic", squad)?.id).toBe("5");
  });
  it("leaves ambiguous and unknown names unmatched", () => {
    expect(matchPlayer("Hernandez", squad)).toBeNull();
    expect(matchPlayer("T. Hernandez", squad)?.id).toBe("7");
    expect(matchPlayer("Someone Else", squad)).toBeNull();
  });
});
