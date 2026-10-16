"use server";

import { getEntitlement } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { codeHubWaitlistEmail } from "@/lib/email-templates";

export type WaitlistState = { status: "idle" | "joined" | "error"; message: string | null };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Adds someone to the Code Hub waitlist (public.code_hub_waitlist, 0055).
 *
 * Signed-in users join with their account email and need not type anything;
 * visitors give an email. Joining twice is not an error: the unique indexes
 * turn it into "you're already on the list". Written with the service role
 * because the table has no policies; only this action and /admin touch it.
 */
export async function joinHubWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  // A field people never see. Bots fill it; pretend it worked.
  if (String(formData.get("website") ?? "")) return { status: "joined", message: null };

  const ent = await getEntitlement();
  const email = (ent.email ?? String(formData.get("email") ?? "")).trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const { error } = await supabaseAdmin()
    .from("code_hub_waitlist")
    .insert({ email, user_id: ent.userId, tier: ent.tier });
  if (error && error.code !== "23505") {
    return { status: "error", message: "Couldn't add you just now. Try again in a moment." };
  }
  // Only on a first join: a repeat click must not send a second email.
  if (!error) await sendEmail({ to: email, ...codeHubWaitlistEmail() });
  return {
    status: "joined",
    message: error ? "You're already on the list." : "You're on the list. We'll email you the day it opens.",
  };
}
