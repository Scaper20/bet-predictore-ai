import { matchesSelection, type SportyBetSelection } from "./markets";
import type { RawMarket } from "./sportybet-api";

/**
 * Reading a pick we have no model for from SportyBet's own numbers, so a code
 * full of 1UPs, goal bounds and goalscorers is read rather than refused.
 *
 * SportyBet quotes a probability beside every outcome on an event (it prices
 * its Bet Builder with them). Measured on a Serie A game, they are its fair
 * chances: margin out, coherent across overlapping outcomes (goal bounds
 * "0-2" carries exactly Under 2.5's 0.4742). That is the "market read". When
 * only a price is known, the margin is taken off flat and the read is marked
 * as coming from the odds alone.
 *
 * Pure: code-scan.ts brings the event's markets (sportybet-direct.ts
 * fetchEventMarkets).
 */

/**
 * Where a pick's chance came from: our model, our goal-timing estimate
 * (lead-process.ts: 1UP and the like, not yet checked against results),
 * SportyBet's own probability, or its price alone.
 */
export type ReadSource = "model" | "estimate" | "market" | "odds";

/** The margin taken off a bare price: about SportyBet's on a two-way market. */
export const ODDS_ONLY_MARGIN = 1.06;

export interface MarketRead {
  probability: number;
  source: "market" | "odds";
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

function outcomeOf(sel: SportyBetSelection, markets: readonly RawMarket[]) {
  return markets.find((m) => matchesSelection(m, sel))?.outcomes?.find((o) => String(o.id) === sel.outcomeId);
}

/** A chance from a price alone: 1/odds with a flat margin taken off. */
export function oddsOnly(odds: number): MarketRead | null {
  if (!(odds > 1)) return null;
  return { probability: round4(Math.min(0.99, 1 / odds / ODDS_ONLY_MARGIN)), source: "odds" };
}

/**
 * SportyBet's chance for one selection on an event's markets: its own
 * probability when it quotes one, else from the price. Null when the
 * selection isn't listed (suspended, or the game has started).
 */
export function marketRead(sel: SportyBetSelection, markets: readonly RawMarket[]): MarketRead | null {
  const o = outcomeOf(sel, markets);
  if (!o) return null;
  const p = Number(o.probability);
  if (p > 0 && p < 1) return { probability: round4(p), source: "market" };
  return oddsOnly(Number(o.odds));
}

/**
 * A Bet Builder's parts as SportyBet's pricing call wants them (odds and
 * probability from the event), or null when a part isn't listed.
 */
export function builderParts(
  eventId: string,
  parts: readonly SportyBetSelection[],
  markets: readonly RawMarket[],
): { selection: SportyBetSelection & { eventId: string }; odds: string; probability: string }[] | null {
  const out = [];
  for (const sel of parts) {
    const o = outcomeOf(sel, markets);
    if (!o || o.odds === undefined || o.probability === undefined) return null;
    out.push({ selection: { eventId, ...sel }, odds: String(o.odds), probability: String(o.probability) });
  }
  return out;
}
