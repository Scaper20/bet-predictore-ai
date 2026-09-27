import { describe, expect, it } from "vitest";
import {
  consensus,
  MIN_BOOKS,
  priceGap,
  ratePrice,
  type BookMarket,
  type MarketQuote,
} from "./consensus";

/** A three-way market at the given prices, asking about the home side. */
function book(key: string, prices: number[], index = 0): BookMarket {
  return { book: key, title: key, prices, index };
}

describe("consensus", () => {
  it("refuses to call two quotes a consensus", () => {
    // A median of two is a mean, and a mean of two is one book plus noise.
    const rows = [book("a", [2.1, 3.4, 3.6]), book("b", [2.12, 3.38, 3.6])];
    expect(rows.length).toBeLessThan(MIN_BOOKS);
    expect(consensus(rows)).toBeNull();
  });

  it("removes each book's own margin before comparing them", () => {
    // 2.00/4.00/4.00 implies 50/25/25 raw, summing to 1.0 exactly — no margin,
    // so the fair probability is the raw one.
    const rows = [
      book("a", [2, 4, 4]),
      book("b", [2, 4, 4]),
      book("c", [2, 4, 4]),
    ];
    const quote = consensus(rows)!;
    expect(quote.fairProbability).toBeCloseTo(0.5, 6);
    expect(quote.margin).toBeCloseTo(0, 6);
  });

  it("does not read a margin as a shorter chance", () => {
    // Same true 50% shot, but priced with a 6% margin: 1.89 implies 52.9%.
    // Left uncorrected, the market would look like a 52.9% chance and any
    // comparison against it would flag value that is really the vig.
    const rows = [
      book("a", [1.89, 3.78, 3.78]),
      book("b", [1.89, 3.78, 3.78]),
      book("c", [1.89, 3.78, 3.78]),
    ];
    const quote = consensus(rows)!;
    expect(quote.fairProbability).toBeCloseTo(0.5, 4);
    expect(quote.margin).toBeGreaterThan(0.05);
  });

  it("takes the median, so one stale book cannot move the consensus", () => {
    const rows = [
      book("a", [2, 4, 4]),
      book("b", [2, 4, 4]),
      book("c", [2, 4, 4]),
      book("d", [2, 4, 4]),
      // A book that never took its opening price down.
      book("stale", [3.2, 3.5, 2.6]),
    ];
    const quote = consensus(rows)!;
    expect(quote.fairProbability).toBeCloseTo(0.5, 6);
  });

  it("reports the longest price and who is offering it", () => {
    const rows = [
      book("a", [2, 4, 4]),
      book("b", [2.15, 3.7, 3.7]),
      book("c", [2.05, 3.9, 3.9]),
    ];
    const quote = consensus(rows)!;
    expect(quote.best.price).toBe(2.15);
    expect(quote.best.book).toBe("b");
  });

  it("names Pinnacle separately when it priced the market", () => {
    const withSharp = consensus([
      book("a", [2, 4, 4]),
      book("b", [2, 4, 4]),
      book("pinnacle", [2.02, 4, 4]),
    ])!;
    expect(withSharp.sharp?.price).toBe(2.02);

    const without = consensus([
      book("a", [2, 4, 4]),
      book("b", [2, 4, 4]),
      book("c", [2, 4, 4]),
    ])!;
    expect(without.sharp).toBeNull();
  });

  it("drops junk rows before counting books", () => {
    // A market summing to 0.7 is not free money, it is a partially suspended
    // book. Three good rows plus junk must not become a four-book consensus.
    const rows = [
      book("a", [2, 4, 4]),
      book("b", [2, 4, 4]),
      book("junk", [5, 8, 9]),
    ];
    expect(consensus(rows)).toBeNull();
  });

  it("refuses a row whose index falls outside its own market", () => {
    const rows = [
      book("a", [2, 4, 4], 7),
      book("b", [2, 4, 4], 7),
      book("c", [2, 4, 4], 7),
    ];
    expect(consensus(rows)).toBeNull();
  });

  it("prices an over/under side from a two-way market", () => {
    const rows = [
      book("a", [1.95, 1.95], 1),
      book("b", [1.95, 1.95], 1),
      book("c", [1.9, 2], 1),
    ];
    const quote = consensus(rows)!;
    expect(quote.fairProbability).toBeCloseTo(0.5, 2);
    expect(quote.books).toBe(3);
  });
});

describe("priceGap", () => {
  it("measures how much longer one price is than another", () => {
    expect(priceGap(2.2, 2)).toBeCloseTo(0.1, 6);
    expect(priceGap(2, 2.2)).toBeCloseTo(-0.0909, 3);
  });

  it("returns nothing rather than infinity for an impossible price", () => {
    expect(priceGap(2, 0)).toBe(0);
    expect(priceGap(1, 2)).toBe(0);
  });
});

describe("ratePrice", () => {
  /** Newcastle v Bournemouth, 25 European books, read live. */
  const NEWCASTLE_HOME: MarketQuote = {
    fairProbability: 1 / 2.2,
    best: { book: "coolbet", title: "Coolbet", price: 2.18 },
    sharp: { book: "pinnacle", title: "Pinnacle", price: 2.1 },
    books: 25,
    margin: 0.053,
  };

  it("does not label every real price a losing bet", () => {
    // The reason this function exists. Every offered price on every book sits
    // below fair value -- that gap is the margin, and a rating that fires on
    // all of them carries no information. SportyBet's 2.18 here matched the
    // longest of 25 books and must not read as a warning.
    const v = ratePrice(2.18, NEWCASTLE_HOME)!;
    expect(v.rating).toBe("best");
    expect(v.vsFair).toBeLessThan(0);
    expect(v.reason).toContain("25 books");
  });

  it("separates prices a user would actually choose between", () => {
    // Same fixture, same book, same afternoon: 2.18 on the home side matched
    // the market and 1.61 on over 2.5 was 2% short of it. One rating must not
    // cover both.
    expect(ratePrice(2.18, NEWCASTLE_HOME)!.rating).toBe("best");
    expect(ratePrice(2.14, NEWCASTLE_HOME)!.rating).toBe("competitive");
    expect(ratePrice(2.1, NEWCASTLE_HOME)!.rating).toBe("short");
    expect(ratePrice(2.0, NEWCASTLE_HOME)!.rating).toBe("poor");
  });

  it("keeps the value rating for the case that is genuinely value", () => {
    // Above the de-vigged fair price is a real edge and should be rare. It is
    // worth more than the other ratings combined, which is why nothing else
    // is allowed to claim it.
    const v = ratePrice(2.3, NEWCASTLE_HOME)!;
    expect(v.rating).toBe("value");
    expect(v.vsFair).toBeGreaterThan(0);
  });

  it("measures against the sharp book when it priced the market", () => {
    const v = ratePrice(2.18, NEWCASTLE_HOME)!;
    // 2.18 against Pinnacle's 2.10.
    expect(v.vsSharp).toBeCloseTo(0.0381, 3);

    const noSharp = ratePrice(2.18, { ...NEWCASTLE_HOME, sharp: null })!;
    expect(noSharp.vsSharp).toBeNull();
  });

  it("treats a tick of rounding as matching, not as falling short", () => {
    // A price equal to the best lands a hair below zero often enough that a
    // bare >= 0 would demote it.
    expect(ratePrice(2.1799, NEWCASTLE_HOME)!.rating).toBe("best");
  });

  it("refuses an impossible price", () => {
    expect(ratePrice(1, NEWCASTLE_HOME)).toBeNull();
    expect(ratePrice(0, NEWCASTLE_HOME)).toBeNull();
  });
});
