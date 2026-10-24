/**
 * Whether a pick of ours can go on a SportyBet code for this game today, and
 * if not, the closest thing that can.
 *
 * SportyBet lists different lines on different games (corners 1X2 on six
 * games in ten, handicaps around each game's own spread), so a pick can be
 * right and still not bookable. In order:
 *
 *   1. exact    the same selection is on the board;
 *   2. twin     a different selection that wins on exactly the same results
 *               (Home -0.5 is Home to win; Home +0.5 is Home or Draw; a 0
 *               handicap is draw no bet; Home -1.5 is the three-way
 *               "Handicap 0:1" Home; most corners is the corners -0.5
 *               handicap), so the chance is unchanged;
 *   3. nearest  the same market at the nearest line SportyBet lists that
 *               still clears the caller's floor, re-priced by the model;
 *   4. none     with the reason.
 *
 * Pure: the caller brings the event's markets and a pricer (leg-pricing.ts).
 */
import { offeredOn, toSportyBet, type SportyBetSelection } from "./markets";

export interface BoardMarket {
  market_id?: string | number;
  specifier?: string | null;
  outcomes?: { id?: string | number; odds?: unknown }[];
}

export type Bookable =
  | { kind: "exact"; market: string; selection: SportyBetSelection }
  | { kind: "twin"; market: string; selection: SportyBetSelection; from: string }
  | { kind: "nearest"; market: string; selection: SportyBetSelection; from: string; probability: number }
  | { kind: "none"; reason: "unmapped" | "no-board" | "not-offered" };

/** Selections that win, push and lose on exactly the same results as `market`. */
export function twinsOf(market: string): { market: string }[] {
  const out: { market: string }[] = [];
  const ah = market.match(/^ah:(home|away):([+-]?\d+(?:\.\d+)?)$/);
  if (ah) {
    const [, side, raw] = ah;
    const line = Number(raw);
    if (line === -0.5) out.push({ market: `1x2:${side}` });
    if (line === 0.5) out.push({ market: `dc:${side}-draw` });
    if (line === 0) out.push({ market: `dnb:${side}` });
    // A side giving n + 0.5 wins exactly when it wins the three-way handicap of n.
    if (line <= -1.5 && Number.isInteger(line + 0.5)) {
      const n = -(line + 0.5);
      out.push({ market: `eh:${side}:${side === "home" ? -n : n}` });
    }
  }
  if (market === "1x2:home" || market === "1x2:away") out.push({ market: `ah:${market.slice(4)}:-0.5` });
  if (market === "dc:home-draw") out.push({ market: "ah:home:0.5" });
  if (market === "dnb:home" || market === "dnb:away") out.push({ market: `ah:${market.slice(4)}:0` });
  if (market === "dc:away-draw") out.push({ market: "ah:away:0.5" });
  const eh = market.match(/^eh:(home|away):([+-]?\d+)$/);
  if (eh) {
    const own = eh[1] === "home" ? Number(eh[2]) : -Number(eh[2]);
    if (own <= -1) out.push({ market: `ah:${eh[1]}:${own - 0.5}` });
  }
  const stat = market.match(/^(corners|shots|sot|bookings):(most|hcp):([a-z-]+)(?::([+-]?\d+(?:\.\d+)?))?$/);
  if (stat) {
    const [, family, kind, who, line] = stat;
    if (kind === "most") {
      if (who === "home" || who === "away") out.push({ market: `${family}:hcp:${who}:-0.5` });
      if (who === "home-or-level") out.push({ market: `${family}:hcp:home:+0.5` });
      if (who === "away-or-level") out.push({ market: `${family}:hcp:away:+0.5` });
    } else if (line !== undefined && (who === "home" || who === "away")) {
      if (Number(line) === -0.5) out.push({ market: `${family}:most:${who}` });
    }
  }
  return out;
}

/** The same kind of selection at another line: the market id with its last part swapped. */
function lineKey(market: string): { stem: string; line: number; signed: boolean } | null {
  if (/:most:/.test(market) || /^(1x2|dc|btts|eh|cs|combo):/.test(market)) return null;
  const parts = market.split(":");
  const last = parts.pop()!;
  if (!/^[+-]?\d+(\.\d+)?$/.test(last)) return null;
  return { stem: parts.join(":"), line: Number(last), signed: last.startsWith("+") || parts.includes("hcp") };
}

/** Every line SportyBet lists for the same kind of selection, nearest first. */
function nearbyLines(market: string, markets: readonly BoardMarket[]): string[] {
  const key = lineKey(market);
  const sel = toSportyBet(market);
  if (!key || !sel) return [];
  const lines = new Set<number>();
  for (const m of markets) {
    if (String(m.market_id) !== sel.marketId || !m.outcomes?.some((o) => String(o.id) === sel.outcomeId)) continue;
    const spec = m.specifier?.match(/^(?:total|hcp)=([+-]?\d+(?:\.\d+)?)$/)?.[1];
    if (spec === undefined) continue;
    // Handicap specifiers are the home line; an away pick's own line is the opposite.
    const own = m.specifier!.startsWith("hcp=") && /:away:/.test(market) ? -Number(spec) : Number(spec);
    if (own !== key.line) lines.add(own === 0 ? 0 : own);
  }
  return [...lines]
    .sort((a, b) => Math.abs(a - key.line) - Math.abs(b - key.line) || b - a)
    .map((l) => `${key.stem}:${key.signed && l > 0 ? `+${l}` : l}`);
}

export interface BookableOptions {
  /** The model's chance for a market (survive), or null when it can't price it. */
  price?: (market: string) => number | null;
  /** The lowest chance a re-lined pick may have. Without a price, no re-lining. */
  floor?: number;
}

export function bookableOn(market: string, markets: readonly BoardMarket[], opts: BookableOptions = {}): Bookable {
  const selection = toSportyBet(market);
  const twins = twinsOf(market);
  if (!selection && twins.length === 0) return { kind: "none", reason: "unmapped" };
  if (markets.length === 0) return { kind: "none", reason: "no-board" };
  if (selection && offeredOn(selection, markets)) return { kind: "exact", market, selection };

  for (const t of twins) {
    const sel = toSportyBet(t.market);
    if (sel && offeredOn(sel, markets)) return { kind: "twin", market: t.market, selection: sel, from: market };
  }

  if (opts.price && opts.floor !== undefined) {
    for (const candidate of nearbyLines(market, markets)) {
      const sel = toSportyBet(candidate);
      const p = opts.price(candidate);
      if (sel && p !== null && p >= opts.floor && offeredOn(sel, markets)) {
        return { kind: "nearest", market: candidate, selection: sel, from: market, probability: p };
      }
    }
  }
  return { kind: "none", reason: "not-offered" };
}
