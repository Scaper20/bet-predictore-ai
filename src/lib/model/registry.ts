/**
 * Model identity.
 *
 * The product used to name its model in seven places in user-facing copy
 * ("Dixon-Coles"), which welded the brand to one implementation: swapping or
 * adding a model would have meant a copy rewrite, and running two at once was
 * not expressible at all.
 *
 * So identity splits three ways:
 *
 *   `id`          internal and durable. Stamped onto every stored prediction
 *                 (predictions_log.model_id) so a track record stays
 *                 attributable once there is more than one model.
 *   `brandName`   the proper noun. What the track record and marketing name.
 *   `publicLabel` the generic in running copy — "the model" — so a sentence
 *                 never has to hard-code a technique or a brand mid-paragraph.
 *
 * This is not a plugin system. One model is live; the rest are declared so the
 * roadmap is expressible without fabricating a record for software that does
 * not exist yet.
 */

import type { SportId } from "@/lib/sports";

export type ModelId = "goals-v1" | "result-v1" | "value-v1" | "hoops-v1";

/**
 * `live` means it has produced picks that are in predictions_log and can be
 * graded. `development` means it has no published record, and any surface
 * rendering it MUST NOT show statistics — that is the whole point of the flag.
 */
export type ModelStatus = "live" | "development";

export interface ModelDescriptor {
  id: ModelId;
  /** The proper noun. Shown wherever a model is named as a thing. */
  brandName: string;
  /** How running copy refers to whichever model is active. Generic on purpose. */
  publicLabel: string;
  /**
   * What it actually is. For code comments, admin surfaces and debugging —
   * never rendered on a customer-facing page.
   */
  internalName: string;
  /**
   * The routable sport, or null when the sport has no /[sport]/ segment yet.
   *
   * Deliberately NOT widening SportId to cover roadmap entries: SPORTS drives
   * generateStaticParams, so a "basketball" SportId would advertise a
   * /basketball/ route that 404s on every child page. A roadmap card is copy,
   * not a routing claim — hence the separate label.
   */
  sport: SportId | null;
  sportLabel: string;
  /**
   * Market families this model is responsible for, matching the prefix stored
   * in predictions_log.market (the part before the first ":").
   *
   * goals-v1 lists every family because that is the truth today: one fitted
   * scoreline distribution produces all of them, which is why the markets can
   * never contradict each other. The roadmap entries declare what they would
   * take over — splitting them needs a coherence rule, not just a dispatcher.
   */
  pickTypes: string[];
  status: ModelStatus;
  /** One plain sentence. Never a performance claim. */
  blurb: string;
}

const MODELS: Record<ModelId, ModelDescriptor> = {
  "goals-v1": {
    id: "goals-v1",
    brandName: "BetriX Strike",
    publicLabel: "the model",
    internalName: "Dixon-Coles bivariate Poisson, time-weighted MLE",
    sport: "football",
    sportLabel: "Football",
    pickTypes: ["1x2", "dc", "btts", "ou", "cs", "ah"],
    status: "live",
    blurb:
      "Fits time-weighted attack and defence ratings on completed results in each " +
      "competition, then expands them into a full scoreline distribution that every " +
      "market is read off.",
  },
  "result-v1": {
    id: "result-v1",
    brandName: "BetriX Verdict",
    publicLabel: "the model",
    internalName: "Ordinal outcome classifier — not yet implemented",
    sport: "football",
    sportLabel: "Football",
    pickTypes: ["1x2", "dc"],
    status: "development",
    blurb:
      "A specialist for match result and double chance, aimed at fixtures where the " +
      "scoreline distribution is well fitted but the outcome split is not.",
  },
  "value-v1": {
    id: "value-v1",
    brandName: "BetriX Ledger",
    publicLabel: "the model",
    internalName: "Price-relative value scoring — not yet implemented",
    sport: "football",
    sportLabel: "Football",
    pickTypes: [],
    status: "development",
    blurb:
      "Compares a fitted fair price against the price actually offered. Blocked on a " +
      "live odds feed, which the product does not have today.",
  },
  "hoops-v1": {
    id: "hoops-v1",
    brandName: "BetriX Rebound",
    publicLabel: "the model",
    internalName: "Possession and efficiency ratings — not yet implemented",
    sport: null,
    sportLabel: "Basketball",
    pickTypes: [],
    status: "development",
    blurb:
      "A separate model, not a reparameterisation of the football one: the current " +
      "engine assumes two sides scoring goals all the way down.",
  },
};

/** The model currently producing predictions. */
export const ACTIVE_MODEL_ID: ModelId = "goals-v1";

export function activeModel(): ModelDescriptor {
  return MODELS[ACTIVE_MODEL_ID];
}

export function modelById(id: ModelId): ModelDescriptor {
  return MODELS[id];
}

/** Every model, live first, for the track record's performance section. */
export function allModels(): ModelDescriptor[] {
  return Object.values(MODELS).sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : 1;
    return a.brandName.localeCompare(b.brandName);
  });
}

export function isModelId(value: string): value is ModelId {
  return value in MODELS;
}
