import { toSportyBet } from "./markets";
import type { RawMarket } from "./sportybet-api";

/**
 * SportyBet's prices as a record over time, and what they say about a pick.
 *
 * Prices move constantly until kick-off, so a single number means little.
 * What matters is where the price stood when we published a pick, and where
 * it closed: the closing price is the market's best guess once every piece of
 * team news is in, so beating it consistently is the standard test of a real
 * edge, and it can be measured long before win/loss records mean anything.
 *
 * Pure: the sync stores compact snapshots (sportybet-sync.ts), settlement
 * and the admin page read them back through these helpers.
 */

/** The markets kept in a snapshot: enough for every pick family we publish, small enough to keep. */
const KEPT_MARKETS = new Set(["1", "10", "29"]);
const KEPT_TOTALS = new Set(["total=1.5", "total=2.5", "total=3.5"]);

/** "<marketId>|<specifier>" -> outcome id -> [odds, SportyBet probability]. */
export type CompactPrices = Record<string, Record<string, [number, number | null]>>;

const keyOf = (marketId: string, specifier?: string | null) => `${marketId}|${specifier ?? ""}`;

/** A board event's markets reduced to what a snapshot keeps. */
export function compactPrices(markets: readonly RawMarket[]): CompactPrices {
  const out: CompactPrices = {};
  for (const m of markets) {
    const id = String(m.market_id ?? "");
    const spec = m.specifier ?? null;
    const kept = KEPT_MARKETS.has(id) || (id === "18" && spec !== null && KEPT_TOTALS.has(spec));
    if (!kept) continue;
    const outcomes: Record<string, [number, number | null]> = {};
    for (const o of m.outcomes ?? []) {
      const odds = Number(o.odds);
      if (!Number.isFinite(odds) || odds <= 1) continue;
      const p = Number(o.probability);
      outcomes[String(o.id)] = [odds, Number.isFinite(p) && p > 0 && p < 1 ? Math.round(p * 10_000) / 10_000 : null];
    }
    if (Object.keys(outcomes).length) out[keyOf(id, spec)] = outcomes;
  }
  return out;
}

export interface MarketPrice {
  odds: number;
  /** The market's own fair probability: 1/odds with the margin taken out across the market. */
  fairProbability: number;
}

/**
 * SportyBet's price for one of our picks in a snapshot, with the margin
 * stripped across the whole market (proportional de-vig). Null when the
 * snapshot does not carry that market, line or outcome, or a market is
 * missing an outcome (a de-vig over part of a market would be wrong).
 */
export function priceInSnapshot(prices: CompactPrices, market: string): MarketPrice | null {
  const sel = toSportyBet(market);
  if (!sel) return null;
  const outcomes = prices[keyOf(sel.marketId, sel.specifier)];
  const mine = outcomes?.[sel.outcomeId];
  if (!outcomes || !mine) return null;
  const expected = sel.marketId === "1" || sel.marketId === "10" ? 3 : 2;
  const all = Object.values(outcomes);
  if (all.length < expected) return null;
  // Double chance outcomes overlap (each game result is in two of them), so
  // its implied probabilities sum to about 2, not 1.
  const overround = all.reduce((s, [odds]) => s + 1 / odds, 0) / (sel.marketId === "10" ? 2 : 1);
  if (!(overround > 0.9 && overround < 1.4)) return null;
  return { odds: mine[0], fairProbability: Math.round((1 / mine[0] / overround) * 10_000) / 10_000 };
}

export interface Snapshot {
  capturedAt: number;
  prices: CompactPrices;
}

/** The last snapshot taken before kick-off: the closing price. */
export function closingSnapshot<T extends Snapshot>(snapshots: readonly T[], kickoff: number): T | null {
  let best: T | null = null;
  for (const s of snapshots) {
    if (s.capturedAt < kickoff && (!best || s.capturedAt > best.capturedAt)) best = s;
  }
  return best;
}

/**
 * Closing line value: how much better the price at publish was than the
 * closing price, as a fraction (0.05 = we had 5% better odds than the close).
 * Positive on average means the market moved toward our picks after we made
 * them, which is what a real edge looks like before results pile up.
 */
export function closingLineValue(atPublish: number, atClose: number): number {
  return Math.round((atPublish / atClose - 1) * 10_000) / 10_000;
}
