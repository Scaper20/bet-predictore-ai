"use server";

import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/site-url";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { POST_AUTH_DESTINATION } from "@/lib/routes";
import { plausibleResetToken, resetCoolingDown } from "@/lib/password-reset";

export type ForgotPasswordState = { error: string | null; sent: boolean; email: string };
export type ResetPasswordState = { error: string | null; expired: boolean };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step one: email a reset link.
 *
 * The link is generated with the admin API and sent through Resend, not
 * Supabase's resetPasswordForEmail(). Supabase's built-in mailer only
 * delivers to the project's own team unless a custom SMTP server is set up,
 * and its PKCE link only works in the browser that asked for it — opening the
 * email on a phone after asking on a laptop would fail. A token hash in our
 * own link works on any device.
 *
 * The answer is the same whether or not the address has an account, so the
 * form can't be used to test which emails are registered.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email address.", sent: false, email };
  }
  if (!supabaseConfigured) return { error: null, sent: true, email };

  try {
    await sendResetLink(email);
  } catch (err) {
    console.error("requestPasswordReset failed:", err);
  }
  return { error: null, sent: true, email };
}

async function sendResetLink(email: string): Promise<void> {
  const admin = supabaseAdmin();

  // generateLink() stamps recovery_sent_at, so it has to be read first.
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) return;
  const { data: existing } = await admin.auth.admin.getUserById(profile.id as string);
  if (!existing?.user || resetCoolingDown(existing.user.recovery_sent_at)) return;

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(`generateLink failed: ${error?.message ?? "no token"}`);

  // Awaited, unlike the other sendEmail() call sites: this email is the whole
  // point of the request, and a serverless function can be frozen the moment
  // the action returns. sendEmail() never rejects.
  await sendEmail({
    to: email,
    ...passwordResetEmail({ url: `${SITE_URL}/account/reset-password?token=${encodeURIComponent(token)}` }),
  });
}

/**
 * Step two: set the new password.
 *
 * The one-time token is verified here, on submit, and not when the link is
 * opened. Mail scanners open every link in an email before the person does;
 * verifying on that first GET would spend the token before they ever saw the
 * form. It also means only someone holding the emailed link can reach
 * updateUser() without the current password — a signed-in session alone
 * can't, which is what changePassword() in account.ts guards against too.
 */
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = formData.get("token");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!plausibleResetToken(token)) return { error: "This reset link isn't valid.", expired: true };
  if (password.length < 8) return { error: "Password must be at least 8 characters.", expired: false };
  if (password.length > 72) return { error: "Password must not exceed 72 characters.", expired: false };
  if (password !== confirm) return { error: "Passwords don't match.", expired: false };
  if (!supabaseConfigured) return { error: "Password reset isn't available right now.", expired: false };

  const supabase = await supabaseServer();
  const { data, error: verifyError } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: token });
  // A second attempt on the same form (the first password was rejected
  // below) finds the token already spent. The session it created is still
  // here and still fresh, so that attempt goes ahead on it.
  const userId = data?.user?.id ?? (verifyError ? await freshRecoveryUser(supabase) : null);
  if (!userId) return { error: "This reset link has expired or has already been used.", expired: true };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message, expired: false };

  const prefs = await getPreferencesFor(supabase, userId);
  redirect(hasOnboarded(prefs) ? POST_AUTH_DESTINATION : `/onboarding?next=${encodeURIComponent(POST_AUTH_DESTINATION)}`);
}

const RETRY_WINDOW_S = 10 * 60;

/**
 * The user id of a session that came from a reset link in the last few
 * minutes, else null. verifyOtp() records its sign-in method as "otp" in the
 * signed access token; nothing else in this app signs in that way (password,
 * OAuth and email-confirmation sessions are all recorded differently), so an
 * "otp" entry means the reset link, and a stolen ordinary session can't pass.
 */
async function freshRecoveryUser(supabase: Awaited<ReturnType<typeof supabaseServer>>): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !Array.isArray(claims.amr)) return null;
  const now = Math.floor(Date.now() / 1000);
  const fresh = claims.amr.some(
    (e) => typeof e === "object" && e.method === "otp" && now - e.timestamp < RETRY_WINDOW_S,
  );
  return fresh ? claims.sub : null;
}
