/**
 * Which model owns a market.
 *
 * The multi-model question this answers is narrower than it first looks, and
 * the backtest is what narrowed it. Splitting one engine into per-market
 * specialists is only worth doing where the specialists would see something
 * the shared one cannot. Measured walk-forward over 1,714 fixtures, the
 * current engine's edge is real in the outcome markets (match result +3.4pp
 * against its own claim, double chance +1.9pp) and absent in the goals markets
 * (over/under -8.4pp, both-teams-to-score -10.9pp). That is not a case for
 * four models producing the same numbers four ways. It is a case for one
 * specialist on totals fed by inputs the scoreline fit does not have —
 * shot volume, game state, availability — because a different parameterisation
 * of the same attack and defence ratings would reproduce the same miss.
 *
 * So this is a routing table, not a plugin system. It exists to make three
 * things true before a second model exists rather than after:
 *
 *   1. Ownership is declared in one place and enforced. Two live models
 *      claiming the same market family is a contradiction the site would show
 *      to a user as two different probabilities for one selection, so it is
 *      rejected at module load rather than discovered in production.
 *   2. Attribution is per pick, not per deployment. predictions_log.model_id
 *      is stamped from the market, so the day a totals specialist starts
 *      publishing, its record separates from BetriX Strike's automatically and
 *      the history stays readable.
 *   3. A model that has not shipped cannot claim anything. `development`
 *      entries declare the markets they are aiming at; ownership only ever
 *      resolves to a `live` model.
 */

import {
  activeModel,
  allModels,
  type ModelDescriptor,
  type ModelId,
} from "./registry";

/** The market family: the part before the first ":", as predictions_log stores it. */
export function familyOf(market: string): string {
  return market.split(":")[0];
}

/**
 * Built once, and it throws rather than resolving an ambiguity quietly.
 *
 * A market owned by two live models has no correct answer — whichever the map
 * happened to be built from last would silently become the truth, and the
 * track record would attribute picks to a model that did not make them.
 */
const OWNERSHIP: Map<string, ModelDescriptor> = (() => {
  const map = new Map<string, ModelDescriptor>();
  for (const model of allModels()) {
    if (model.status !== "live") continue;
    for (const family of model.pickTypes) {
      const existing = map.get(family);
      if (existing) {
        throw new Error(
          `Market family "${family}" is claimed by two live models, ` +
            `${existing.id} and ${model.id}. Exactly one live model may own a family — ` +
            `see src/lib/model/router.ts.`,
        );
      }
      map.set(family, model);
    }
  }
  return map;
})();

/**
 * The live model responsible for a market.
 *
 * Falls back to the active model for a family nobody claims, which is the
 * honest answer today: one engine produces every market off a single fitted
 * scoreline distribution, so an unclaimed family still came from it. The
 * fallback is what stops an unlisted market from being attributed to nothing.
 */
export function ownerOf(market: string): ModelDescriptor {
  return OWNERSHIP.get(familyOf(market)) ?? activeModel();
}

/** What to stamp on a stored pick. */
export function modelIdForMarket(market: string): ModelId {
  return ownerOf(market).id;
}

/**
 * Every market family a model is answerable for today.
 *
 * Distinct from `descriptor.pickTypes`, which for a roadmap entry is an
 * intention. This only ever returns families the model actually owns, so a
 * performance surface cannot accidentally file a market under a model that has
 * never produced one.
 */
export function familiesOwnedBy(id: ModelId): string[] {
  return [...OWNERSHIP.entries()].filter(([, m]) => m.id === id).map(([family]) => family);
}
