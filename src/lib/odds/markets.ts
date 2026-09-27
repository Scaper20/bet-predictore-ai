/**
 * Translating BetriX market ids to SportyBet's, and back.
 *
 * Pure and separately tested, because this mapping is the one place a mistake
 * is both silent and expensive: quoting the wrong market means telling a user
 * that the price for "over 2.5" is good when the number came from "over 1.5".
 * A wrong price is worse than no price, since the entire value feature exists
 * to say what a price is worth.
 *
 * SportyBet uses Betradar's market catalogue, so the ids below are the
 * standard ones (1 = 1X2, 10 = double chance, 18 = totals, 29 = both teams to
 * score, 45 = correct score) with Betradar outcome ids underneath.
 *
 * Everything keys on the NUMERIC id, never the display name, and that is
 * load-bearing rather than stylistic. A single fixture carries 821 markets,
 * among them "Double Chance - 1UP" (60110) beside "Double Chance" (10), and
 * "GG/NG 2+" (60000) beside "GG/NG" (29). Those are different products at
 * different prices. Matching on a name that merely starts with the right words
 * would quote a user the price of a bet they are not making — the same class
 * of error as the league-name grouping in 0013, and avoided the same way.
 */

/** One selection, addressed the way SportyBet addresses it. */
export interface SportyBetSelection {
  marketId: string;
  outcomeId: string;
  /** Only the lined markets carry one, e.g. "total=2.5" for over/under. */
  specifier?: string;
}

const ONE_X_TWO: Record<string, string> = { home: "1", draw: "2", away: "3" };

/** Betradar orders double chance 1X, 12, X2 — not the order the ids suggest. */
const DOUBLE_CHANCE: Record<string, string> = {
  "home-draw": "9",
  "home-away": "10",
  "away-draw": "11",
};

const BTTS: Record<string, string> = { yes: "74", no: "76" };

const TOTALS: Record<string, string> = { over: "12", under: "13" };

/**
 * The SportyBet address for a BetriX market id, or null when the market has no
 * equivalent we are confident about.
 *
 * Correct score is deliberately unmapped. SportyBet carries it (market 45) but
 * its outcome ids are per-scoreline and were not verified, and guessing one
 * would quote a price for the wrong scoreline. The model rarely selects a
 * correct-score pick anyway — returning null simply means the value verdict
 * does not render, which is the behaviour for any unpriced market.
 */
export function toSportyBet(market: string): SportyBetSelection | null {
  const [family, ...rest] = market.split(":");

  if (family === "1x2") {
    const outcomeId = ONE_X_TWO[rest[0]];
    return outcomeId ? { marketId: "1", outcomeId } : null;
  }

  if (family === "dc") {
    const outcomeId = DOUBLE_CHANCE[rest[0]];
    return outcomeId ? { marketId: "10", outcomeId } : null;
  }

  if (family === "btts") {
    const outcomeId = BTTS[rest[0]];
    return outcomeId ? { marketId: "29", outcomeId } : null;
  }

  if (family === "ou") {
    const outcomeId = TOTALS[rest[0]];
    const line = rest[1];
    if (!outcomeId || !line) return null;
    // The line has to survive the round trip exactly: SportyBet quotes
    // "total=2.5" and "total=2" as separate markets at very different prices.
    if (!/^\d+(\.\d+)?$/.test(line)) return null;
    return { marketId: "18", outcomeId, specifier: `total=${line}` };
  }

  return null;
}

/** True when a market has a SportyBet equivalent worth quoting. */
export function isQuotable(market: string): boolean {
  return toSportyBet(market) !== null;
}

/**
 * Whether a market entry from SportyBet is the one a selection asked for.
 *
 * Both the id and the specifier must agree. The specifier is what separates
 * the fourteen over/under lines that all share market id 18.
 */
export function matchesSelection(
  entry: { market_id?: string | number; specifier?: string | null },
  selection: SportyBetSelection,
): boolean {
  if (String(entry.market_id) !== selection.marketId) return false;
  const wanted = selection.specifier ?? null;
  const actual = entry.specifier ?? null;
  return wanted === actual;
}

/**
 * Reads a decimal price out of SportyBet's payload, which quotes odds as
 * strings.
 *
 * Returns undefined rather than a number for anything unusable — a suspended
 * outcome, a blank, a zero. Undefined is what assessValue() already treats as
 * "no price offered", so an unavailable market degrades into the same,
 * already-handled state as a user who has not typed a price.
 */
export function readOdds(raw: unknown): number | undefined {
  if (typeof raw === "number") return raw > 1 ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 1 ? value : undefined;
}
