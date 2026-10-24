/**
 * A builder's candidates, kept to what SportyBet lists on the game today.
 *
 * Each single pick goes through bookableOn (odds/bookable.ts): kept as it is,
 * swapped to a twin with the same chance, re-lined to the nearest listed line
 * that clears its floor (re-priced, relabelled), or dropped. A same-game
 * combo is kept only when its ready-made market, or every Bet Builder part,
 * is listed. With `marketGap`, a single pick SportyBet itself rates that far
 * below the model is dropped too (market-check.ts). Pure; the caller brings
 * the board and a pricer.
 */
import { friendlyLabel, type Candidate } from "@/lib/forge";
import { marketDissents } from "@/lib/market-check";
import { bookableOn, type BoardMarket } from "@/lib/odds/bookable";
import { offeredOn, toSportyBet, toSportyBetBuilder } from "@/lib/odds/markets";

export interface BoardOptions {
  home: string;
  away: string;
  /** The model's chance for any market on this game, or null when it can't price it. */
  price: (market: string) => number | null;
  /** The lowest chance a re-lined pick may have, given the pick it replaces. */
  floor: (c: Candidate) => number;
  /** Drop a single pick SportyBet rates this far or more below the model (LEG_MARKET_GAP). */
  marketGap?: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function onBoard(c: Candidate, markets: readonly BoardMarket[], opts: BoardOptions): Candidate | null {
  if (c.market.startsWith("combo:")) {
    const sel = toSportyBet(c.market);
    if (sel) return offeredOn(sel, markets) ? c : null;
    const parts = toSportyBetBuilder(c.market);
    return parts && parts.every((p) => offeredOn(p, markets)) ? c : null;
  }
  const b = bookableOn(c.market, markets, { price: opts.price, floor: opts.floor(c) });
  if (b.kind === "none") return null;
  const probability = b.kind === "nearest" ? b.probability : c.probability;
  if (opts.marketGap !== undefined && marketDissents(b.market, probability, markets, opts.marketGap)) return null;
  if (b.kind === "exact") return c;
  const label = friendlyLabel(b.market, opts.home, opts.away, c.label);
  return { ...c, market: b.market, label, probability, fairOdds: round2(1 / probability), picks: [{ market: b.market, label }] };
}

/** How a stored leg goes on a code now: as it is, as its same-chance twin, or not, with why. */
export type LegBooking =
  | { ok: true; market: string; twin: boolean }
  | { ok: false; reason: "not-listed" | "unmapped" | "no-board" | "not-offered" };

/**
 * A leg picked earlier, checked against the game's listing at booking time.
 * Never a different line: the combo's chance was worked out for this pick.
 * An old board without markets can't say, so a mapped leg goes on and
 * SportyBet's own check decides.
 */
export function bookLeg(market: string, event: { markets: readonly BoardMarket[] } | null): LegBooking {
  if (!event) return { ok: false, reason: "not-listed" };
  if (event.markets.length === 0) return toSportyBet(market) ? { ok: true, market, twin: false } : { ok: false, reason: "unmapped" };
  const b = bookableOn(market, event.markets);
  if (b.kind === "none") return { ok: false, reason: b.reason };
  return { ok: true, market: b.market, twin: b.kind === "twin" };
}

/** Every candidate through onBoard, without duplicates (two picks can land on one twin). */
export function keepOnBoard(candidates: readonly Candidate[], markets: readonly BoardMarket[], opts: BoardOptions): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of candidates) {
    const kept = onBoard(c, markets, opts);
    if (!kept || seen.has(kept.market)) continue;
    seen.add(kept.market);
    out.push(kept);
  }
  return out;
}
