import { sweetSpotLeague } from "./sweet-spots";

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
 *
 * Only in the 17 divisions the model is tested on (SWEET_SPOT_LEAGUES), also
 * from 17 Oct 2026. Elsewhere the picks have not earned it: Strong picks
 * outside them landed 14 of 20 live (70%, stated 79%), against 26 of 30
 * (87%) inside. Replayed over two years of MLS, Brazil, Argentina, Liga MX and
 * seven other leagues, 63+ landed 71.0% (stated 77.9%) and 60+ 76.1%, no
 * better than the standard picks of the tested divisions.
 */
export const STRONG_CONFIDENCE = 63;

export type PickTier = "strong" | "standard";

export function pickTier(confidence: number, leagueCode: string | null | undefined): PickTier {
  return confidence >= STRONG_CONFIDENCE && sweetSpotLeague(leagueCode ?? undefined) ? "strong" : "standard";
}

export function isStrong(pick: { confidence: number } | null | undefined, leagueCode: string | null | undefined): boolean {
  return !!pick && pickTier(pick.confidence, leagueCode) === "strong";
}
