"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { safeNext } from "@/lib/safe-redirect";

export type AuthActionState = { error: string | null };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signIn(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) return { error: "Enter your email and password." };
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message || "Incorrect email or password." };
  }

  if (data?.user) {
    const prefs = await getPreferencesFor(supabase, data.user.id);
    if (!hasOnboarded(prefs)) {
      redirect(`/onboarding?next=${encodeURIComponent(next)}`);
    }
  }

  redirect(next);
}

export async function signUp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) return { error: "Enter an email and a password." };
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password.length > 72) return { error: "Password must not exceed 72 characters." };

  const supabase = await supabaseServer();

  // 1. Direct duplicate check against profiles database table
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    return { error: "An account with this email address already exists. Please sign in instead." };
  }

  // 2. Perform Supabase authentication sign-up
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    if (signUpError.message.toLowerCase().includes("already registered") || signUpError.status === 422) {
      return { error: "An account with this email address already exists. Please sign in instead." };
    }
    return { error: signUpError.message };
  }

  // Detect Supabase returning empty identities array (existing user with enumeration protection)
  if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
    return { error: "An account with this email address already exists. Please sign in instead." };
  }

  // Ensure session is active and cookies are set immediately.
  if (!signUpData?.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      if (signInError.message.toLowerCase().includes("email not confirmed")) {
        return { error: "Account created! Please check your email to confirm your account before signing in." };
      }
      return { error: signInError.message };
    }
  }

  void sendEmail({ to: email, ...welcomeEmail() });

  // Straight into onboarding, carrying the original destination so whatever
  // they were trying to reach still happens once the questions are answered.
  redirect(`/onboarding?next=${encodeURIComponent(next)}`);
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

