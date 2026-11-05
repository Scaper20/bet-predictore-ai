import { evaluatePick, type PickResult } from "@/lib/settlement";
import { gradeLegFull } from "@/lib/leg-pricing";
import { isRawMarket } from "@/lib/odds/markets";

/**
 * One grade for any pick we publish, from the final score and, for markets
 * settled on the halves (1st half, 2nd half, both halves), the half-time score.
 *
 * evaluatePick knows our own market ids; the SportyBet-style raw ids (halves,
 * goal bounds, the extra selections the owner can switch on in
 * model/selections.ts) are graded by leg-pricing's grader. A halves market with
 * no half-time score yet is null, never a guess: the caller waits and retries.
 */
export function gradePick(market: string, home: number, away: number, ht?: { home: number; away: number } | null): PickResult | null {
  if (!isRawMarket(market)) return evaluatePick(market, home, away);
  const g = gradeLegFull(market, { home, away }, ht ?? null);
  return g === "win" || g === "lose" || g === "push" ? g : null;
}

/** Both half-time numbers, or null. */
export function halftimeOf(score: { home: number | null; away: number | null } | null | undefined): { home: number; away: number } | null {
  return score && typeof score.home === "number" && typeof score.away === "number" ? { home: score.home, away: score.away } : null;
}
