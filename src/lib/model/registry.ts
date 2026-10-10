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

export type ModelId = "goals-v1" | "goals-v2" | "result-v1" | "value-v1" | "hoops-v1";

/**
 * `live` means it is producing picks now. `retired` means it produced picks
 * that are in predictions_log, still graded and shown under its own name, but
 * it owns no markets any more. `development` means it has no published
 * record, and any surface rendering it MUST NOT show statistics — that is the
 * whole point of the flag.
 */
export type ModelStatus = "live" | "retired" | "development";

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
  /**
   * When it took over (live) or handed over (retired), as shown on the track
   * record. A pick belongs to whichever model published it before kickoff, so
   * games played just after a switch can sit on the retired model's record.
   */
  servedFrom?: string;
}

const MODELS: Record<ModelId, ModelDescriptor> = {
  "goals-v1": {
    id: "goals-v1",
    brandName: "KiqStat Strike",
    publicLabel: "the model",
    internalName: "Dixon-Coles bivariate Poisson, time-weighted MLE (goals only, picks from 15 matches)",
    sport: "football",
    sportLabel: "Football",
    // Retired: owns nothing, so every new pick is goals-v2's. Its record stays.
    pickTypes: [],
    status: "retired",
    blurb:
      "Our first model: time-weighted attack and defence ratings fitted on goals alone. " +
      "Replaced in October 2026; every pick it published is still graded here.",
    servedFrom: "6 Oct 2026, 07:38 WAT. Its last picks, published at 04:25 that morning, covered the games of 6 Oct and stay on its record.",
  },
  "goals-v2": {
    id: "goals-v2",
    brandName: "KiqStat Strike 2",
    publicLabel: "the model",
    internalName:
      "Dixon-Coles bivariate Poisson on a goals + shots-on-target response, promoted-club prior, 200-match publishing bar",
    sport: "football",
    sportLabel: "Football",
    pickTypes: ["1x2", "dc", "btts", "ou", "cs", "ah"],
    status: "live",
    blurb:
      "Rates every club on the chances it creates and concedes as well as its goals, " +
      "and only stands a pick on a competition with 200 or more completed matches behind it.",
    servedFrom: "6 Oct 2026, 07:38 WAT",
  },
  "result-v1": {
    id: "result-v1",
    brandName: "KiqStat Verdict",
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
    brandName: "KiqStat Ledger",
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
    brandName: "KiqStat Rebound",
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
export const ACTIVE_MODEL_ID: ModelId = "goals-v2";

/** Rows stored before predictions_log carried a model_id (0012) were all goals-v1's. */
export const LEGACY_MODEL_ID: ModelId = "goals-v1";

export function activeModel(): ModelDescriptor {
  return MODELS[ACTIVE_MODEL_ID];
}

export function modelById(id: ModelId): ModelDescriptor {
  return MODELS[id];
}

const STATUS_ORDER: Record<ModelStatus, number> = { live: 0, retired: 1, development: 2 };

/** Every model, live first, then retired, then the roadmap. */
export function allModels(): ModelDescriptor[] {
  return Object.values(MODELS).sort((a, b) => {
    if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return a.brandName.localeCompare(b.brandName);
  });
}

export function isModelId(value: string): value is ModelId {
  return value in MODELS;
}
