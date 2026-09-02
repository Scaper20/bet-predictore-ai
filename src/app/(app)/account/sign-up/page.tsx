import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { safeNext } from "@/lib/safe-redirect";
import { POST_AUTH_DESTINATION } from "@/lib/routes";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Create account - BetriX" };

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
    <Container width="shell" className="py-12 md:py-20">
      <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-12">
        {/* Left Hero Content */}
        <div className="space-y-6 lg:col-span-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3.5 py-1 text-xs font-semibold text-brand">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            CREATE YOUR FREE ACCOUNT
          </div>

          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Unlock Smarter Match <span className="text-gradient-brand">Predictions</span>
          </h1>

          <p className="text-base leading-relaxed text-ink-muted">
            Join sports fans and data analysts using AI-driven insights to analyze odds and track performance.
          </p>

          <div className="card space-y-4 bg-grid p-6">
            <div className="flex items-center gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
                1
              </div>
              <span className="text-sm font-medium text-ink">Quick 30-second registration</span>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
                2
              </div>
              <span className="text-sm font-medium text-ink">Personalized feed & league preferences</span>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
                3
              </div>
              <span className="text-sm font-medium text-ink">Instant access to predictions & live scores</span>
            </div>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-6">
          <div className="card glow-brand relative overflow-hidden p-8 sm:p-10">
            <div className="mb-6 border-b border-line pb-6">
              <h2 className="font-display text-2xl font-bold">Create your account</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Free account — saved preferences and optional paid plans.
              </p>
            </div>

            <Suspense fallback={<div className="skeleton h-48 rounded-lg" />}>
              <SignUpForm defaultNext={next} />
            </Suspense>
          </div>
        </div>
      </div>
    </Container>
  );
}

