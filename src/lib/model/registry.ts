/**
 * Model identity.
 *
 * The product used to name its model in seven places in user-facing copy
 * ("Dixon-Coles"), which welded the brand to one implementation: swapping or
 * adding a model would have meant a copy rewrite, and running two at once was
 * not expressible at all.
 *
 * So identity splits in two. `id` is internal and durable — it is what a
 * stored prediction should be stamped with so a track record stays
 * attributable once there is more than one model. `publicLabel` is what a
 * user-facing surface says when it has to refer to the model at all, and it
 * is deliberately generic: the copy describes what the model *does* rather
 * than what it is called.
 *
 * This is not a plugin system. There is one model, and the seam exists so
 * that adding a second is an edit here rather than a search across the app.
 */

export type ModelId = "goals-v1";

export interface ModelDescriptor {
  id: ModelId;
  /** How the UI refers to it. Generic on purpose — never a technique name. */
  publicLabel: string;
  /**
   * What it actually is. For code comments, admin surfaces and debugging —
   * never rendered on a customer-facing page.
   */
  internalName: string;
}

const MODELS: Record<ModelId, ModelDescriptor> = {
  "goals-v1": {
    id: "goals-v1",
    publicLabel: "the model",
    internalName: "Dixon-Coles bivariate Poisson, time-weighted MLE",
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
