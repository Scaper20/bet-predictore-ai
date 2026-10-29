/**
 * Holds a game's headline to the pick already published for it.
 *
 * The headline is rebuilt on every read from inputs that move all day:
 * SportyBet's board, the selection switches, a deploy. Once the settle cron
 * has logged a pick (predictions_log), that pick is the one on the record and
 * the one people have booked, so every page serves it until the game is
 * over, however the live read has moved since. Pure; service.ts reads the
 * rows.
 */

import type { Pick, Prediction } from "@/lib/model/predict";

export interface LoggedPick {
  match_id: string;
  market: string;
  label: string;
  probability: number;
  fair_odds: number;
  /** Null on rows logged before 0040. */
  confidence: number | null;
}

function groupOf(market: string): Pick["group"] {
  const family = market.split(":")[0];
  if (family === "corners") return "Corners";
  if (family === "shots" || family === "sot") return "Shots";
  if (family === "ah") return "Asian Handicap";
  if (family === "dc") return "Double Chance";
  if (family === "ou") return "Goals";
  if (family === "btts") return "Both Teams To Score";
  if (family === "cs") return "Correct Score";
  return "Match Result";
}

/** The prediction with its logged pick at the head, or as it was when nothing is logged. */
export function holdPublished(prediction: Prediction, logged: LoggedPick | undefined): Prediction {
  if (!logged) return prediction;
  if (prediction.topPick?.market === logged.market) return prediction;
  const current = prediction.picks.find((p) => p.market === logged.market);
  const held: Pick = {
    market: logged.market,
    label: logged.label,
    group: current?.group ?? groupOf(logged.market),
    probability: Number(logged.probability),
    fairOdds: Number(logged.fair_odds),
    confidence: logged.confidence === null ? (current?.confidence ?? 0) : Number(logged.confidence),
  };
  return {
    ...prediction,
    topPick: held,
    picks: [held, ...prediction.picks.filter((p) => p.market !== logged.market)],
    sweetSpot: false,
    // It described a different headline from the one now shown.
    marketCheck: undefined,
  };
}
