import { describe, expect, it } from "vitest";
import event from "./__fixtures__/sportybet-event-markets.json";
import { builderParts, marketRead, oddsOnly } from "./market-read";
import { fromRaw, rawMarket, toSportyBet, toSportyBetBuilder } from "./markets";
import { parseEventMarkets } from "./sportybet-api";

/* Milan v Bologna, Serie A, read from SportyBet's event endpoint on 24 Oct 2026. */
const markets = parseEventMarkets(event)!;

describe("raw markets", () => {
  it("round-trip SportyBet's address, colons in the specifier and outcome included", () => {
    for (const sel of [
      { marketId: "60200", outcomeId: "1" },
      { marketId: "450001", outcomeId: "12" },
      { marketId: "21", outcomeId: "sr:exact_goals:6+:70", specifier: "variant=sr:exact_goals:6+" },
      { marketId: "60180", outcomeId: "13", specifier: "minsnr=10|total=1.5" },
    ]) {
      const m = rawMarket(sel);
      expect(m.split(":")).toHaveLength(4);
      expect(fromRaw(m)).toEqual(sel);
      expect(toSportyBet(m)).toEqual(sel);
    }
    expect(fromRaw("ou:over:2.5")).toBeNull();
    expect(fromRaw("raw:x::1")).toBeNull();
  });

  it("can go back into a Bet Builder they came out of", () => {
    expect(toSportyBetBuilder("combo:1x2:home+raw:60300::74")).toEqual([
      { marketId: "1", outcomeId: "1" },
      { marketId: "60300", outcomeId: "74" },
    ]);
  });
});

describe("marketRead", () => {
  it("reads SportyBet's own chance for markets we don't model", () => {
    // 1X2 - 1UP, Home: 1.33, quoted at 71.6%.
    expect(marketRead({ marketId: "60200", outcomeId: "1" }, markets)).toEqual({ probability: 0.7163, source: "market" });
    // Goal bounds "1-2" and Both Halves Over 1.5 "No".
    expect(marketRead({ marketId: "450001", outcomeId: "12" }, markets)?.probability).toBeCloseTo(0.4078, 4);
    expect(marketRead({ marketId: "58", outcomeId: "76", specifier: "total=1.5" }, markets)?.probability).toBeCloseTo(0.8357, 4);
    expect(
      marketRead({ marketId: "21", outcomeId: "sr:exact_goals:6+:70", specifier: "variant=sr:exact_goals:6+" }, markets)?.source,
    ).toBe("market");
  });

  it("agrees with the margin-free price on a market we do model", () => {
    // 1X2 Home at 1.65 over a 103.1% book: 58.8%; SportyBet quotes 59.2%.
    expect(marketRead({ marketId: "1", outcomeId: "1" }, markets)!.probability).toBeCloseTo(0.5922, 3);
  });

  it("is null for a pick SportyBet no longer lists", () => {
    expect(marketRead({ marketId: "60200", outcomeId: "9" }, markets)).toBeNull();
    expect(marketRead({ marketId: "58", outcomeId: "76", specifier: "total=2.5" }, markets)).toBeNull();
  });

  it("falls back to the price, margin off, when there is no probability", () => {
    expect(oddsOnly(2)).toEqual({ probability: 0.4717, source: "odds" });
    expect(oddsOnly(1)).toBeNull();
    expect(marketRead({ marketId: "1", outcomeId: "1" }, [{ market_id: "1", specifier: null, outcomes: [{ id: "1", odds: "1.5" }] }])?.source).toBe("odds");
  });
});

describe("builderParts", () => {
  it("prices each part for SportyBet's builder call, or none when a part is missing", () => {
    const parts = builderParts("sr:match:71945352", [{ marketId: "1", outcomeId: "1" }, { marketId: "60200", outcomeId: "1" }], markets);
    expect(parts).toEqual([
      { selection: { eventId: "sr:match:71945352", marketId: "1", outcomeId: "1" }, odds: "1.65", probability: "0.5922200000" },
      { selection: { eventId: "sr:match:71945352", marketId: "60200", outcomeId: "1" }, odds: "1.33", probability: "0.7162635408" },
    ]);
    expect(builderParts("sr:match:1", [{ marketId: "999", outcomeId: "1" }], markets)).toBeNull();
  });
});
