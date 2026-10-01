/**
 * When a priced selection counts as a value alert.
 *
 * Pure and dependency-free so the rule can be tested without a network. The
 * rule deliberately adds nothing of its own: it fires exactly where the match
 * page's own price panel already says "value", so an alert can never disagree
 * with the page it links to.
 *
 *  - Where a multi-book consensus exists, SportyBet's price must sit above the
 *    market's de-vigged fair price. That needs no faith in our model at all,
 *    and it should be rare — see ratePrice in odds/consensus.ts.
 *  - Only where no consensus exists (NPFL, CAF, markets the books feed does
 *    not carry) does the model's own break-even stand in, and then only past
 *    MIN_MEANINGFUL_EDGE — anything less sits inside the model's error bars.
 */

import type { SelectionPricing } from "@/lib/odds";

/** The markets alerts are scanned on: the ones both price sources carry. */
export const ALERT_MARKETS = [
  "1x2:home",
  "1x2:draw",
  "1x2:away",
  "ou:over:2.5",
  "ou:under:2.5",
  "btts:yes",
  "btts:no",
] as const;

export interface ValueHit {
  benchmark: "market" | "model";
  edge: number;
  reason: string;
  price: number;
}

export function valueHit(s: Pick<SelectionPricing, "local" | "priceVerdict" | "modelVerdict">): ValueHit | null {
  if (s.local === null) return null;
  if (s.priceVerdict) {
    return s.priceVerdict.rating === "value"
      ? { benchmark: "market", edge: s.priceVerdict.vsFair, reason: s.priceVerdict.reason, price: s.local }
      : null;
  }
  if (s.modelVerdict?.rating === "value") {
    return { benchmark: "model", edge: s.modelVerdict.edge, reason: s.modelVerdict.reason, price: s.local };
  }
  return null;
}

/** The page rescans in the background once the newest scan is this old. */
export const STALE_AFTER_MS = 30 * 60_000;
/** A scan still "running" after this long is assumed dead. */
export const SCAN_LOCK_MS = 5 * 60_000;

export interface ScanInfo {
  startedAt: string;
  finishedAt: string | null;
  fixtures: number | null;
}

/**
 * Whether a background rescan is due: the newest scan is stale, and no other
 * scan is plausibly still running.
 */
export function scanDue(scan: ScanInfo | null, now = Date.now()): boolean {
  if (!scan) return true;
  const started = Date.parse(scan.startedAt);
  if (!scan.finishedAt && now - started < SCAN_LOCK_MS) return false;
  return now - started > STALE_AFTER_MS;
}
