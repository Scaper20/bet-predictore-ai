/**
 * Strong picks: the headline picks the model is most confident in.
 *
 * Decided before kickoff from the pick's confidence (probability weighted by
 * data quality and how decisive the game is; predict.ts confidenceFor), and
 * stamped on the log row then. Never recomputed after a result.
 *
 * 60 is where the walk-forward backtest (held-out 2025-26 + 2026-27, 3,314
 * goals-v2 picks) split cleanly: 60+ was 15% of picks and landed 80.1%;
 * 50-60 landed 75.8%. docs/strong-picks.md has the table.
 *
 * Raised to 63 on 17 Oct 2026, when sweet spots (sweet-spots.ts) became the
 * pick in 17 divisions: their picks sit at higher chances, so 60+ grew to 57%
 * of picks. Replayed over the last 365 days (scripts/decision-lab.ts), 63+
 * was 20% of picks and landed 86.3%, the rest 80.7%. With the whole-line
 * handicaps added the same day, 63+ was 26% of picks and landed 86.5%.
 */
export const STRONG_CONFIDENCE = 63;

export type PickTier = "strong" | "standard";

export function pickTier(confidence: number): PickTier {
  return confidence >= STRONG_CONFIDENCE ? "strong" : "standard";
}

export function isStrong(pick: { confidence: number } | null | undefined): boolean {
  return !!pick && pickTier(pick.confidence) === "strong";
}
