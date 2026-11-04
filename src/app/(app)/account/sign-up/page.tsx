import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { safeNext } from "@/lib/safe-redirect";
import { POST_AUTH_DESTINATION } from "@/lib/routes";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResponsibleNote } from "@/components/auth/responsible-note";

export const metadata: Metadata = { title: "Create account - KiqStat" };

export default async function SignUpPage({
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
    <AuthShell
      mode="sign-up"
      next={params?.next}
      title="Join KiqStat"
      smallTalk="Free, no card. You'll be in before kick-off."
      footer={<ResponsibleNote />}
    >
      <Suspense fallback={<div className="skeleton h-64 rounded-xl" />}>
        <SignUpForm defaultNext={next} />
      </Suspense>
    </AuthShell>
  );
}
