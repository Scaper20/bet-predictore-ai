import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";
import { getPreferencesFor, hasOnboarded } from "@/lib/preferences";
import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { signOut } from "@/app/actions/auth";
import { signOutAllDevices } from "@/app/actions/account";
import { Badge, ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { StatCard } from "@/components/ui/stat-card";
import { ProfileForm } from "@/components/account/profile-form";
import { PreferencesForm } from "@/components/account/preferences-form";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { AccountSectionNav } from "@/components/account/account-section-nav";

export const metadata: Metadata = { title: "Account" };

const TIER_LABEL = { free: "Free", pass: "Weekend Pass", pro: "Pro", vip: "VIP" } as const;

const INTENT_LABEL = {
  team: "Following your team",
  value: "Finding value",
  accas: "Building accumulators",
} as const;

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "preferences", label: "Preferences" },
  { id: "billing", label: "Plan & billing" },
  { id: "security", label: "Security" },
  { id: "danger", label: "Danger zone" },
];

/**
 * The account dashboard.
 *
 * This was a 32rem single column — the narrowest page on the site — which
 * made the one surface that is supposed to reward having an account feel like
 * a settings modal. It now runs full width with the sections laid out side by
 * side and an at-a-glance strip on top, so signing up visibly buys something.
 *
 * One page with in-page sections rather than nested routes. /account/billing
 * stays its own route because it owns the Paystack callback, so the rail does
 * disappear when you click through to it — hence the explicit way back from
 * there.
 */
export default async function AccountPage() {
  if (!supabaseConfigured) {
    return (
      <Container width="form" className="py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Accounts aren&apos;t set up yet</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This deployment hasn&apos;t configured Supabase. Live scores, fixtures and predictions
          all work without it.
        </p>
      </Container>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login?next=/account");

  const [entitlement, subscription, profileResult, preferences] = await Promise.all([
    getEntitlement(),
    getSubscriptionRow(supabase, user.id),
    supabase.from("profiles").select("display_name, created_at").eq("id", user.id).maybeSingle(),
    getPreferencesFor(supabase, user.id),
  ]);

  const displayName = profileResult.data?.display_name ?? "";
  const createdAt = profileResult.data?.created_at as string | undefined;
  const hasActiveSubscription = hasLivePaidSubscription(subscription);
  const paid = entitlement.tier !== "free";
  const followed = preferences.leagues
    .map(leagueByCode)
    .filter((l): l is NonNullable<typeof l> => l !== undefined);

  return (
    <Container width="shell" className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {displayName ? `Welcome back, ${displayName}` : "Your account"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{user.email}</p>
        </div>
        <ButtonLink href="/account/billing" variant={paid ? "secondary" : "primary"}>
          {paid ? "Manage plan" : "See plans"}
        </ButtonLink>
      </div>

      <div className="mt-6">
        <AccountSectionNav sections={SECTIONS} />
      </div>

      {/*
        Someone who skipped the questionnaire gets one unobtrusive offer to
        finish it, rather than being redirected into it on every visit.
        Forcing it would cost more accounts than the answers are worth.
      */}
      {!hasOnboarded(preferences) && (
        <div className="card mt-8 flex flex-wrap items-center gap-4 border-brand/25 p-5">
          <div className="min-w-[16rem] flex-1">
            <p className="text-sm font-semibold">Finish setting up your feed</p>
            <p className="mt-1 text-xs text-ink-muted">
              Three quick questions and your leagues lead everything you see.
            </p>
          </div>
          <ButtonLink href="/onboarding?next=/account" variant="secondary" className="px-4 py-2">
            Pick up where you left off
          </ButtonLink>
        </div>
      )}

      <section id="overview" className="scroll-mt-32 pt-10">
        <SectionHeading eyebrow="Overview" title="At a glance" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Plan"
            value={TIER_LABEL[entitlement.tier]}
            sublabel={paid ? "Manage it under Plan & billing." : "Upgrade whenever you like."}
          />
          <StatCard
            label="Leagues followed"
            value={String(followed.length)}
            sublabel={
              followed.length > 0
                ? followed.map((l) => l.shortName).join(", ")
                : "Pick some under Preferences to shape your feed."
            }
          />
          <StatCard
            label="You use it for"
            value={preferences.usageIntent ? INTENT_LABEL[preferences.usageIntent] : "—"}
            sublabel="Decides which numbers we lead with."
          />
          <StatCard
            label="Member since"
            value={
              createdAt
                ? new Date(createdAt).toLocaleDateString("en-NG", {
                    month: "short",
                    year: "numeric",
                  })
                : "—"
            }
          />
        </div>
      </section>

      <section id="preferences" className="scroll-mt-32 pt-14">
        <SectionHeading
          eyebrow="Preferences"
          title="Your feed and your details"
          description="Everything here shapes what you see first."
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="card p-7">
            <PreferencesForm leagues={LEAGUES} preferences={preferences} />
          </div>
          <div className="card p-7">
            <h3 className="mb-4 text-sm font-semibold">Your details</h3>
            <ProfileForm initialDisplayName={displayName} />
          </div>
        </div>
      </section>

      <section id="billing" className="scroll-mt-32 pt-14">
        <SectionHeading eyebrow="Plan & billing" title="What you're on" />
        <div className="card mt-6 flex flex-wrap items-center gap-5 p-7">
          <div className="min-w-[14rem] flex-1">
            <Badge tone={paid ? "brand" : "neutral"}>{TIER_LABEL[entitlement.tier]}</Badge>
            <p className="mt-3 text-sm text-ink-muted">
              {paid
                ? "Invoices, payment method and cancellation all live on the billing page."
                : "Free covers live scores, fixtures and every market on every match. Paid plans add value detection and the enhanced breakdowns."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/pricing" variant="secondary">
              Compare plans
            </ButtonLink>
            <ButtonLink href="/account/billing">{paid ? "Manage billing" : "Upgrade"}</ButtonLink>
          </div>
        </div>
      </section>

      <section id="security" className="scroll-mt-32 pt-14">
        <SectionHeading eyebrow="Security" title="Login & security" />
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="card divide-y divide-line p-7">
            <div className="pb-6">
              <h3 className="mb-4 text-sm font-semibold">Change email</h3>
              <ChangeEmailForm currentEmail={user.email ?? ""} />
            </div>
            <div className="pt-6">
              <h3 className="mb-4 text-sm font-semibold">Change password</h3>
              <ChangePasswordForm />
            </div>
          </div>

          <div className="card p-7">
            <h3 className="mb-1 text-sm font-semibold">Sessions</h3>
            <p className="mb-4 text-xs text-ink-dim">
              Sign out of this device, or everywhere you&apos;re signed in.
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Sign out
                </button>
              </form>
              <form action={signOutAllDevices}>
                <button
                  type="submit"
                  className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Sign out everywhere
                </button>
              </form>
            </div>

            <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-ink-dim">
              Need a hand?{" "}
              <Link href="/responsible-gambling" className="underline underline-offset-2">
                Responsible gambling resources
              </Link>{" "}
              are always available.
            </p>
          </div>
        </div>
      </section>

      <section id="danger" className="scroll-mt-32 pb-4 pt-14">
        <SectionHeading eyebrow="Danger zone" title="Delete account" />
        <div className="card mt-6 max-w-2xl border-rose/25 p-7">
          <DeleteAccountForm hasActiveSubscription={hasActiveSubscription} />
        </div>
      </section>
    </Container>
  );
}
