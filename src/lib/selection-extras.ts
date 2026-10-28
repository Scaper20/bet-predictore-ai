import type { Pick, Prediction } from "@/lib/model/predict";
import { confidenceFor } from "@/lib/model/predict";
import { fairOdds } from "@/lib/model/odds";
import { priceLeg } from "@/lib/leg-pricing";
import { gridFor, halvesFor } from "@/lib/forge";
import { extrasOn, type Surface } from "@/lib/model/selections";

/**
 * The extra selections the owner has switched on for a surface (the halves,
 * the goal bounds: model/selections.ts), priced off the game's own score
 * grids as picks. Empty while none is on.
 */
export function extraPicks(p: Prediction, surface: Surface): Pick[] {
  const on = extrasOn(surface);
  if (on.length === 0) return [];
  const ctx = { goals: gridFor(p), halves: halvesFor(p) };
  return on.flatMap((s) => {
    const price = priceLeg(s.market, ctx);
    if (!price || !(price.survive > 0)) return [];
    const probability = Math.round(price.survive * 10_000) / 10_000;
    return [{ market: s.market, label: s.label, group: "Goals" as const, probability, fairOdds: fairOdds(probability), confidence: confidenceFor(probability, p.model.dataQuality, p.model.uncertainty) }];
  });
}
