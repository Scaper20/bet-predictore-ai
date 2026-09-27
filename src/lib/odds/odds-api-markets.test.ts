import { describe, expect, it } from "vitest";
import { bookMarketFor, isFeatured, type OddsApiBook } from "./odds-api-markets";

const TEAMS = { home: "Newcastle United", away: "Bournemouth" };

/** Shaped exactly like the live payload, outcome order included. */
const PINNACLE: OddsApiBook = {
  key: "pinnacle",
  title: "Pinnacle",
  markets: [
    {
      key: "h2h",
      outcomes: [
        { name: "Bournemouth", price: 3.41 },
        { name: "Newcastle United", price: 2.1 },
        { name: "Draw", price: 3.78 },
      ],
    },
    {
      key: "totals",
      outcomes: [
        { name: "Over", price: 1.94, point: 3 },
        { name: "Under", price: 1.94, point: 3 },
        { name: "Over", price: 1.53, point: 2.5 },
        { name: "Under", price: 2.55, point: 2.5 },
      ],
    },
  ],
};

describe("bookMarketFor", () => {
  it("puts 1X2 into a canonical order the payload does not use", () => {
    // The live response returns away, home, draw. Reading positionally would
    // quote the away price under the home selection.
    expect(bookMarketFor(PINNACLE, "1x2:home", TEAMS)).toEqual({
      book: "pinnacle",
      title: "Pinnacle",
      prices: [2.1, 3.78, 3.41],
      index: 0,
    });
    expect(bookMarketFor(PINNACLE, "1x2:draw", TEAMS)?.index).toBe(1);
    expect(bookMarketFor(PINNACLE, "1x2:away", TEAMS)?.index).toBe(2);
  });

  it("reads the requested total, not the book's main line", () => {
    // Pinnacle's main line here is 3.0 and it is listed first. Asking for 2.5
    // must return 2.5 — quoting 1.94 for an over 2.5 bet that is really 1.53
    // would overstate the price by a quarter.
    const row = bookMarketFor(PINNACLE, "ou:over:2.5", TEAMS)!;
    expect(row.prices).toEqual([1.53, 2.55]);
    expect(row.index).toBe(0);

    const three = bookMarketFor(PINNACLE, "ou:over:3", TEAMS)!;
    expect(three.prices).toEqual([1.94, 1.94]);
  });

  it("pairs under with the over on its own line", () => {
    const row = bookMarketFor(PINNACLE, "ou:under:2.5", TEAMS)!;
    expect(row.prices).toEqual([1.53, 2.55]);
    expect(row.index).toBe(1);
  });

  it("returns nothing for a line the book does not offer", () => {
    expect(bookMarketFor(PINNACLE, "ou:over:4.5", TEAMS)).toBeNull();
  });

  it("returns nothing when a side of the market is missing", () => {
    const half: OddsApiBook = {
      key: "a",
      title: "A",
      markets: [{ key: "h2h", outcomes: [{ name: "Newcastle United", price: 2.1 }] }],
    };
    expect(bookMarketFor(half, "1x2:home", TEAMS)).toBeNull();
  });

  it("refuses markets that are not featured rather than guessing", () => {
    // Double chance, BTTS and correct score exist on The Odds API but only
    // through the per-event endpoint at a much higher credit cost. SportyBet
    // carries them, so these fall back rather than being approximated.
    expect(bookMarketFor(PINNACLE, "btts:yes", TEAMS)).toBeNull();
    expect(bookMarketFor(PINNACLE, "dc:home-draw", TEAMS)).toBeNull();
    expect(bookMarketFor(PINNACLE, "cs:2-1", TEAMS)).toBeNull();
    expect(bookMarketFor(PINNACLE, "1x2:nonsense", TEAMS)).toBeNull();
    expect(bookMarketFor(PINNACLE, "ou:over:x", TEAMS)).toBeNull();
  });

  it("ignores a suspended price rather than treating it as a number", () => {
    const suspended: OddsApiBook = {
      key: "a",
      title: "A",
      markets: [
        {
          key: "h2h",
          outcomes: [
            { name: "Newcastle United", price: 0 },
            { name: "Draw", price: 3.78 },
            { name: "Bournemouth", price: 3.41 },
          ],
        },
      ],
    };
    expect(bookMarketFor(suspended, "1x2:home", TEAMS)).toBeNull();
  });
});

describe("isFeatured", () => {
  it("knows which families are worth spending a credit on", () => {
    expect(isFeatured("1x2:home")).toBe(true);
    expect(isFeatured("ou:over:2.5")).toBe(true);
    expect(isFeatured("btts:yes")).toBe(false);
    expect(isFeatured("cs:2-1")).toBe(false);
  });
});
