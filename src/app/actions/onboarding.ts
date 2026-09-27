"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { POST_AUTH_DESTINATION } from "@/lib/routes";
import { leagueByCode } from "@/lib/leagues";
import { DEFAULT_SPORT } from "@/lib/sports";
import { DIGEST_CHOICES, TOTAL_STEPS, USAGE_INTENTS } from "@/lib/onboarding";

export type OnboardingActionState = { error: string | null };

const VALID_INTENTS = new Set<string>(USAGE_INTENTS);
const VALID_DIGESTS = new Set<string>(DIGEST_CHOICES);

/**
 * Saves one step and moves on.
 *
 * Every step writes immediately rather than accumulating answers and saving
 * at the end. This is the highest-drop-off moment in the whole funnel, so a
 * user who abandons after step one should still have told us something useful
 * — and `last_step` is what makes the drop-off measurable at all, given there
 * is no analytics stack.
 *
 * `onboarded_at` is only stamped on the final step, so "started" and
 * "finished" stay distinguishable.
 */
export async function saveOnboardingStep(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (!supabaseConfigured) return { error: "Accounts aren't set up on this deployment." };

  const step = Number(formData.get("step") ?? 1);
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    return { error: "Something went wrong — try again." };
  }

  const next = safeNext(formData.get("next"), POST_AUTH_DESTINATION);
  const skipped = formData.get("intent") === "skip";

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Session expired mid-flow. Send them back through login rather than
  // silently dropping the answers they just gave.
  if (!user) redirect(`/account/login?next=${encodeURIComponent(`/onboarding?step=${step}`)}`);

  const last = step === TOTAL_STEPS;
  const patch: Record<string, unknown> = {
    user_id: user.id,
    last_step: step,
    updated_at: new Date().toISOString(),
  };
  if (step === 1) patch.started_at = new Date().toISOString();
  if (last) patch.onboarded_at = new Date().toISOString();

  // A skipped step records that it was reached, but writes no answer — so a
  // skip is never mistaken for a deliberate empty selection.
  if (!skipped) {
    if (step === 1) {
      // Codes come from a form the user controls, so they are checked against
      // the catalogue rather than trusted.
      const leagues = formData
        .getAll("leagues")
        .map(String)
        .filter((code) => leagueByCode(code) !== undefined);
      patch.leagues = leagues;
      patch.sports = [
        ...new Set(leagues.map((code) => leagueByCode(code)?.sport ?? DEFAULT_SPORT)),
      ];
    }

    if (step === 2) {
      const intent = String(formData.get("usageIntent") ?? "");
      if (VALID_INTENTS.has(intent)) patch.usage_intent = intent;
    }

    if (step === 3) {
      const digest = String(formData.get("digest") ?? "");
      if (VALID_DIGESTS.has(digest)) patch.digest = digest;
    }
  }

  const { error } = await supabase
    .from("user_preferences")
    .upsert(patch, { onConflict: "user_id" });

  if (error) return { error: "Couldn't save that — try again." };

  if (last) {
    revalidatePath("/account");
    redirect(next);
  }

  redirect(`/onboarding?step=${step + 1}&next=${encodeURIComponent(next)}`);
}

/**
 * Leaves the flow without finishing it.
 *
 * Records nothing beyond what earlier steps already saved and does NOT stamp
 * onboarded_at, so the "finish setting up" prompt on the account page still
 * has something to offer. Forcing the questionnaire would cost more sign-ups
 * than the answers are worth.
 */
export async function skipOnboarding(formData: FormData) {
  redirect(safeNext(formData.get("next"), POST_AUTH_DESTINATION));
}
