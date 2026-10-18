import type { Prediction } from "./predict";
import { pausedHandicapCandidates } from "./sweet-spots";

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
  reason: "paused-handicap" | "btts";
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
