import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { safeNext } from "@/lib/safe-redirect";
import { LoginForm } from "@/components/auth/login-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Sign in - BetriX" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params?.next);

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
            AI-POWERED MATCH INTELLIGENCE
          </div>

          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Welcome back to <span className="text-gradient-brand">BetriX</span>
          </h1>

          <p className="text-base leading-relaxed text-ink-muted">
            Access your personalized predictions, saved league feeds, value alerts, and premium analytics.
          </p>

          <div className="card space-y-4 bg-grid p-6">
            <div className="flex items-start gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-sm font-bold text-brand">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink">Tailored Match Intelligence</h4>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Custom data density for the leagues and betting markets you care about most.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan/15 text-sm font-bold text-cyan">
                ⚡
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink">Real-time Value Signals</h4>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Algorithmic odds discrepancy detection across global bookmakers.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber/15 text-sm font-bold text-amber">
                ★
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink">Verified Track Record</h4>
                <p className="mt-0.5 text-xs text-ink-muted">
                  100% transparent historical outcome tracking and ROI stats.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-6">
          <div className="card glow-brand relative overflow-hidden p-8 sm:p-10">
            <div className="mb-6 border-b border-line pb-6">
              <h2 className="font-display text-2xl font-bold">Sign In</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Enter your account credentials to access your dashboard.
              </p>
            </div>

            <Suspense fallback={<div className="skeleton h-48 rounded-lg" />}>
              <LoginForm defaultNext={next} />
            </Suspense>
          </div>
        </div>
      </div>
    </Container>
  );
}

