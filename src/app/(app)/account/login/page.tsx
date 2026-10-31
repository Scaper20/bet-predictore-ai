import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { safeNext } from "@/lib/safe-redirect";
import { POST_AUTH_DESTINATION } from "@/lib/routes";
import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResponsibleNote } from "@/components/auth/responsible-note";

export const metadata: Metadata = { title: "Sign in - KiqStat" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params?.next, POST_AUTH_DESTINATION);

  if (supabaseConfigured) {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const prefs = await getPreferencesFor(supabase, user.id);
      if (!hasOnboarded(prefs)) {
        redirect(`/onboarding?next=${encodeURIComponent(next)}`);
      } else {
        redirect(next);
      }
    }
  }

  return (
    <AuthShell mode="login" next={params?.next} title={greeting()} smallTalk="Good to have you back." footer={<ResponsibleNote />}>
      <Suspense fallback={<div className="skeleton h-56 rounded-xl" />}>
        <LoginForm defaultNext={next} />
      </Suspense>
    </AuthShell>
  );
}

/** By the hour in Lagos, where most people sign in from. */
function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Lagos" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
