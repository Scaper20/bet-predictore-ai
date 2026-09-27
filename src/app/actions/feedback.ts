"use server";

import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export type FeedbackActionState = { error: string | null; ok: boolean };

/**
 * Deliberately permissive about *when* this can be called (signed in or
 * not — see 0016_feedback.sql), but still server-validated: a score is
 * meaningless outside 0–10, and an unbounded comment defeats the point of
 * the DB's own check(char_length(comment) <= 2000) by returning a
 * confusing failure instead of a clear one.
 */
export async function submitFeedback(
  _prev: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  if (!supabaseConfigured) return { error: "Feedback isn't set up on this deployment.", ok: false };

  const scoreRaw = formData.get("score");
  const score = scoreRaw === null || scoreRaw === "" ? null : Number(scoreRaw);
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 10)) {
    return { error: "Something went wrong. Try again.", ok: false };
  }

  const comment = String(formData.get("comment") ?? "").trim().slice(0, 2000) || null;
  const pagePath = String(formData.get("pagePath") ?? "").slice(0, 300) || null;

  if (score === null && !comment) {
    return { error: "Add a rating or a comment first.", ok: false };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    score,
    comment,
    page_path: pagePath,
  });
  if (error) return { error: "Couldn't send your feedback. Try again.", ok: false };

  return { error: null, ok: true };
}
