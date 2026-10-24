import type { Prediction } from "./predict";
import { pausedHandicapCandidates } from "./sweet-spots";
import { priceLeg } from "@/lib/leg-pricing";
import { rawMarket } from "@/lib/odds/markets";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "./halves";
import { scoreMatrix } from "./poisson";

/**
 * Selections logged and graded but never published: the paused handicaps
 * (model/paused.ts) and both teams to score, GG or NG, whichever the model
 * leans to. Written beside predictions_log into public.shadow_picks (0059)
 * so each has a live record to be judged on before it is a pick again.
 */
export interface ShadowPick {
  market: string;
  label: string;
  probability: number;
  reason: "paused-handicap" | "btts" | "new-market";
}

export function shadowPicks(p: Pick<Prediction, "picks" | "asianHandicap" | "match">): ShadowPick[] {
  const out: ShadowPick[] = pausedHandicapCandidates(p.picks, p.match.league.code, p.asianHandicap).map((c) => ({
    ...c,
    reason: "paused-handicap",
  }));
  const yes = p.picks.find((x) => x.market === "btts:yes");
  const no = p.picks.find((x) => x.market === "btts:no");
  const lean = yes && no ? (yes.probability >= no.probability ? yes : no) : (yes ?? no);
  if (lean) {
    out.push({
      market: lean.market,
      label: lean.market === "btts:yes" ? "GG (both teams score)" : "NG (not both teams score)",
      probability: lean.probability,
      reason: "btts",
    });
  }
  return out;
}

/** The new goal markets with a chance of being picks one day: the likeliest of what the code reader now prices. */
const NEW_MARKETS: { market: string; label: string }[] = [
  { market: rawMarket({ marketId: "900984", outcomeId: "74" }), label: "Both halves over 0.5" },
  { market: rawMarket({ marketId: "68", outcomeId: "12", specifier: "total=0.5" }), label: "1st half over 0.5" },
  { market: rawMarket({ marketId: "90", outcomeId: "12", specifier: "total=0.5" }), label: "2nd half over 0.5" },
  { market: rawMarket({ marketId: "450001", outcomeId: "3" }), label: "Goal bounds 0-3" },
  { market: rawMarket({ marketId: "450001", outcomeId: "14" }), label: "Goal bounds 1-4" },
];

/** Only a chance worth publishing one day is worth a record. */
const NEW_MARKET_FLOOR = 0.6;

/**
 * The new goal markets the model has at 60% or more on this game, logged
 * with reason "new-market" (0079) to earn a record before any is a pick.
 */
export function newMarketShadow(p: Pick<Prediction, "markets" | "model">): ShadowPick[] {
  const { home, away } = p.markets.expectedGoals;
  const share = { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE };
  const ctx = { goals: scoreMatrix(home, away, p.model.rho), halves: halfGrids(home, away, share, SITE_HALF_TILT, SITE_SECOND_HALF_TILT) };
  return NEW_MARKETS.flatMap(({ market, label }) => {
    const price = priceLeg(market, ctx);
    return price && price.survive >= NEW_MARKET_FLOOR
      ? [{ market, label, probability: Math.round(price.survive * 10_000) / 10_000, reason: "new-market" as const }]
      : [];
  });
}
