"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";

export type AccountActionState = { error: string | null; message: string | null };

export async function updateProfile(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length > 80) {
    return { error: "Display name is too long (80 characters max).", message: null };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again to continue.", message: null };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save your changes. Try again.", message: null };

  revalidatePath("/account");
  return { error: null, message: "Profile updated." };
}

export async function changePassword(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword) return { error: "Fill in both password fields.", message: null };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters.", message: null };
  if (newPassword !== confirmPassword) return { error: "New passwords don't match.", message: null };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sign in again to continue.", message: null };

  // Re-auth before a sensitive mutation — defends against a hijacked or
  // left-open session being used to lock the real owner out.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (reauthError) return { error: "Current password is incorrect.", message: null };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message, message: null };

  return { error: null, message: "Password updated." };
}

export async function changeEmail(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const password = String(formData.get("password") ?? "");
  const newEmail = String(formData.get("newEmail") ?? "").trim();
  if (!password || !newEmail) return { error: "Fill in both fields.", message: null };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sign in again to continue.", message: null };
  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    return { error: "That's already your email.", message: null };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (reauthError) return { error: "Password is incorrect.", message: null };

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message, message: null };

  // Copy is deliberately non-committal about single- vs double-confirmation:
  // that's a Supabase dashboard setting ("Secure email change"), not
  // something this app can detect — this wording is correct either way.
  return {
    error: null,
    message: `Check your inbox to confirm the change to ${newEmail}. Some projects also require confirming from your old inbox before it takes effect.`,
  };
}

export async function deleteAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (confirmation !== "DELETE") return { error: 'Type "DELETE" to confirm.', message: null };
  if (!password) return { error: "Enter your password to confirm.", message: null };

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Sign in again to continue.", message: null };

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (reauthError) return { error: "Password is incorrect.", message: null };

  const subscription = await getSubscriptionRow(supabase, user.id);
  if (hasLivePaidSubscription(subscription)) {
    return {
      error: "You have an active subscription. Cancel it from Manage subscription first, then delete your account.",
      message: null,
    };
  }

  // Exception to admin.ts's general rule against calling supabaseAdmin() from
  // a user-session action: auth.admin.deleteUser is the only primitive that
  // can delete a user's own auth.users row at all — there's no anon-key
  // equivalent. Safe here specifically because the session was just
  // re-verified above via signInWithPassword, and the id used is always the
  // one from that freshly-verified session, never client-supplied.
  const { error } = await supabaseAdmin().auth.admin.deleteUser(user.id);
  if (error) return { error: "Couldn't delete your account. Try again or contact support.", message: null };

  try {
    await supabase.auth.signOut();
  } catch {
    // Local cookies are cleared regardless; the redirect below is what matters.
  }
  redirect("/");
}

export async function signOutAllDevices() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/");
}
