/**
 * Translating a BetriX market id into The Odds API's payload, and back.
 *
 * Pure and separately tested for the same reason src/lib/odds/markets.ts is:
 * a mistake here is silent, and it produces a confident number for the wrong
 * bet. The failure mode that matters is the totals line -- forty books quote
 * over/under at 2, 2.5, 2.75 and 3 in the same response, all under one market
 * key, distinguished only by a `point` field. Reading the wrong one quotes a
 * price for a bet the user is not making.
 *
 * The Odds API names 1X2 outcomes by TEAM rather than by side, so this needs
 * the fixture's own team strings. That is not a fuzzy-matching problem: the
 * names come from the same response as the outcomes, so an exact comparison is
 * both correct and the only safe option.
 *
 * Only the two "featured" markets are addressable. Double chance, both teams
 * to score and correct score exist on The Odds API but live behind the
 * per-event endpoint at a much higher credit cost, so they resolve to null and
 * fall back to SportyBet's own price, which carries them.
 */

import type { BookMarket } from "./consensus";

export interface OddsApiOutcome {
  name?: string;
  price?: number;
  /** Present on lined markets: the total, the handicap. */
  point?: number;
}

export interface OddsApiMarket {
  key?: string;
  outcomes?: OddsApiOutcome[];
}

export interface OddsApiBook {
  key?: string;
  title?: string;
  markets?: OddsApiMarket[];
}

/** The market keys worth requesting: one credit each, per region. */
export const FEATURED_MARKETS = ["h2h", "totals"] as const;

/** True when a market id has a Odds API equivalent worth requesting. */
export function isFeatured(market: string): boolean {
  const family = market.split(":")[0];
  return family === "1x2" || family === "ou";
}

function priceOf(outcome: OddsApiOutcome | undefined): number | null {
  return typeof outcome?.price === "number" && outcome.price > 1 ? outcome.price : null;
}

/**
 * One book's row for exactly the selection asked about, or null.
 *
 * The whole market is carried through in `prices` -- all three of 1X2, both
 * sides of a total -- because the consensus cannot remove the book's margin
 * from a single quote, and a comparison made against a price with the margin
 * still in it flags value that is not there.
 */
export function bookMarketFor(
  book: OddsApiBook,
  market: string,
  teams: { home: string; away: string },
): BookMarket | null {
  const key = book.key;
  const title = book.title ?? book.key;
  if (!key || !title) return null;

  const [family, ...rest] = market.split(":");

  if (family === "1x2") {
    const entry = book.markets?.find((m) => m.key === "h2h");
    if (!entry?.outcomes) return null;

    // Canonical order, because the payload's order is not stable: the sample
    // response returns away, home, draw.
    const home = priceOf(entry.outcomes.find((o) => o.name === teams.home));
    const draw = priceOf(entry.outcomes.find((o) => o.name === "Draw"));
    const away = priceOf(entry.outcomes.find((o) => o.name === teams.away));
    if (home === null || draw === null || away === null) return null;

    const index = { home: 0, draw: 1, away: 2 }[rest[0] ?? ""];
    if (index === undefined) return null;
    return { book: key, title, prices: [home, draw, away], index };
  }

  if (family === "ou") {
    const side = rest[0];
    const line = Number(rest[1]);
    if ((side !== "over" && side !== "under") || !Number.isFinite(line)) return null;

    const entry = book.markets?.find((m) => m.key === "totals");
    if (!entry?.outcomes) return null;

    // One market key carries every line the book offers. Only the pair on the
    // requested line may be compared -- mixing 2.5 with 3 would de-vig one
    // bet's price against another bet's.
    const onLine = entry.outcomes.filter(
      (o) => typeof o.point === "number" && Math.abs(o.point - line) < 1e-9,
    );
    const over = priceOf(onLine.find((o) => o.name === "Over"));
    const under = priceOf(onLine.find((o) => o.name === "Under"));
    if (over === null || under === null) return null;

    return { book: key, title, prices: [over, under], index: side === "over" ? 0 : 1 };
  }

  return null;
}
