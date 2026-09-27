import { describe, expect, it } from "vitest";
import { isQuotable, matchesSelection, readOdds, toSportyBet } from "./markets";

describe("toSportyBet", () => {
  it("maps every market family the model publishes", () => {
    // Verified against a live get_event_odds payload, not assumed.
    expect(toSportyBet("1x2:home")).toEqual({ marketId: "1", outcomeId: "1" });
    expect(toSportyBet("1x2:draw")).toEqual({ marketId: "1", outcomeId: "2" });
    expect(toSportyBet("1x2:away")).toEqual({ marketId: "1", outcomeId: "3" });
    expect(toSportyBet("dc:home-draw")).toEqual({ marketId: "10", outcomeId: "9" });
    expect(toSportyBet("dc:home-away")).toEqual({ marketId: "10", outcomeId: "10" });
    expect(toSportyBet("dc:away-draw")).toEqual({ marketId: "10", outcomeId: "11" });
    expect(toSportyBet("btts:yes")).toEqual({ marketId: "29", outcomeId: "74" });
    expect(toSportyBet("btts:no")).toEqual({ marketId: "29", outcomeId: "76" });
  });

  it("carries the line through as a specifier, exactly", () => {
    // "total=2" and "total=2.5" are different markets at very different
    // prices; losing the decimal quotes the wrong one.
    expect(toSportyBet("ou:over:2.5")).toEqual({
      marketId: "18", outcomeId: "12", specifier: "total=2.5",
    });
    expect(toSportyBet("ou:under:3.5")).toEqual({
      marketId: "18", outcomeId: "13", specifier: "total=3.5",
    });
  });

  it("refuses a market it cannot address confidently", () => {
    // Correct score exists on SportyBet but its per-scoreline outcome ids were
    // never verified, and a guess would price the wrong scoreline.
    expect(toSportyBet("cs:2-1")).toBeNull();
    expect(toSportyBet("ah:home:-1.5")).toBeNull();
    expect(toSportyBet("1x2:nonsense")).toBeNull();
    expect(toSportyBet("ou:over:")).toBeNull();
    expect(toSportyBet("ou:sideways:2.5")).toBeNull();
    expect(toSportyBet("")).toBeNull();
  });

  it("rejects a line that is not a number rather than passing it through", () => {
    expect(toSportyBet("ou:over:2.5x")).toBeNull();
    expect(toSportyBet("ou:over:abc")).toBeNull();
  });
});

describe("matchesSelection", () => {
  const over25 = toSportyBet("ou:over:2.5")!;

  it("separates the lines that share market id 18", () => {
    expect(matchesSelection({ market_id: "18", specifier: "total=2.5" }, over25)).toBe(true);
    expect(matchesSelection({ market_id: "18", specifier: "total=1.5" }, over25)).toBe(false);
    expect(matchesSelection({ market_id: "18", specifier: "total=2" }, over25)).toBe(false);
  });

  it("does not confuse a lookalike product with the real one", () => {
    // A fixture carries "Double Chance" (10) and "Double Chance - 1UP"
    // (60110); "GG/NG" (29) and "GG/NG 2+" (60000). Different bets.
    const dc = toSportyBet("dc:home-draw")!;
    expect(matchesSelection({ market_id: "10" }, dc)).toBe(true);
    expect(matchesSelection({ market_id: "60110" }, dc)).toBe(false);

    const btts = toSportyBet("btts:yes")!;
    expect(matchesSelection({ market_id: "29" }, btts)).toBe(true);
    expect(matchesSelection({ market_id: "60000" }, btts)).toBe(false);
  });

  it("treats a numeric id the same as a string one", () => {
    expect(matchesSelection({ market_id: 1 }, toSportyBet("1x2:home")!)).toBe(true);
  });

  it("requires an unlined market to have no specifier", () => {
    const home = toSportyBet("1x2:home")!;
    expect(matchesSelection({ market_id: "1", specifier: null }, home)).toBe(true);
    expect(matchesSelection({ market_id: "1", specifier: "total=2.5" }, home)).toBe(false);
  });
});

describe("readOdds", () => {
  it("reads the string prices SportyBet quotes", () => {
    expect(readOdds("2.18")).toBeCloseTo(2.18);
    expect(readOdds(" 3.79 ")).toBeCloseTo(3.79);
    expect(readOdds(2.5)).toBe(2.5);
  });

  it("returns nothing for a price that cannot be taken", () => {
    // Undefined is what assessValue() already handles as "no price offered",
    // so a suspended market degrades into an already-correct state.
    for (const v of ["", "  ", "0", "1", "1.00", "-2", "abc", null, undefined, {}]) {
      expect(readOdds(v), String(v)).toBeUndefined();
    }
  });
});

describe("isQuotable", () => {
  it("agrees with toSportyBet", () => {
    expect(isQuotable("1x2:home")).toBe(true);
    expect(isQuotable("ou:over:2.5")).toBe(true);
    expect(isQuotable("cs:2-1")).toBe(false);
  });
});
