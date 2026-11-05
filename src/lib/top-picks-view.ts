import "server-only";

import { buildTopPicks, type TopPick } from "@/lib/top-picks";
import { withStatOutcomes } from "@/lib/stat-results";
import { listedLinesFor } from "@/lib/sportybet-lines";
import type { ViewedPrediction } from "@/lib/access";
import type { StatMarkets } from "@/lib/model/match-stats";

/**
 * The top picks as a viewer sees them, built once for every surface that shows
 * them: the match page's Top picks block and the image the Share button
 * downloads. One function, so the card and the image can never show different
 * picks, in a different order, or with a different outcome.
 *
 * Corners and shots grade from ESPN minutes after full time, and halves markets
 * from the half-time score stored at the break, not days later. Only Pro sees the
 * corners slot, so only then is SportyBet's board read for it.
 */
export async function topPicksForView(prediction: ViewedPrediction, corners?: StatMarkets | null): Promise<TopPick[]> {
  const listed = corners ? await listedLinesFor(prediction.match, prediction).catch(() => null) : undefined;
  return withStatOutcomes(buildTopPicks({ prediction, corners, listed }), prediction.match);
}
