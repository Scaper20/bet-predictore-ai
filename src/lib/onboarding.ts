/**
 * Shape of the onboarding flow.
 *
 * Separate from the server action that consumes it because a "use server"
 * module may only export async functions — a plain const there fails the
 * build with "Failed to collect page data", which is a confusing way to find
 * that out. Keeping the shape here also means the page can render the
 * progress indicator without pulling in the action.
 */

export const ONBOARDING_STEPS = ["Your leagues", "How you use it", "Staying updated"] as const;

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

/** Answers the flow accepts, used to validate what comes back from the form. */
export const USAGE_INTENTS = ["team", "value", "accas"] as const;
export const DIGEST_CHOICES = ["matchday", "weekend", "none"] as const;
