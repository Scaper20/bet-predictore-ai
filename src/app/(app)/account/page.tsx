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
import { ButtonLink, SectionHeading } from "@/components/ui/primitives";
import { PlanCard } from "@/components/account/plan-card";
import { offerStateFor } from "@/lib/offers-server";
import { sportPath } from "@/lib/routes";
import { Container } from "@/components/ui/container";
import { StatCard } from "@/components/ui/stat-card";
import { ProfileForm } from "@/components/account/profile-form";
import { PreferencesForm } from "@/components/account/preferences-form";
import { ChangeEmailForm } from "@/components/account/change-email-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { AccountSectionNav } from "@/components/account/account-section-nav";
import { NotificationControls } from "@/components/pwa/notification-controls";

export const metadata: Metadata = { title: "Account" };

const TIER_LABEL = { free: "Free", pass: "Pass", pro: "Pro", vip: "VIP" } as const;

const INTENT_LABEL = {
  team: "Following your team",
  value: "Finding value",
  accas: "Building combos",
} as const;

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "preferences", label: "Feed" },
  { id: "notifications", label: "Alerts" },
  { id: "security", label: "Security" },
];

const QUICK_LINKS = [
  { href: sportPath("predictions"), label: "Today's picks", icon: "◎" },
  { href: sportPath("trackedSlips"), label: "My combos", icon: "≡" },
  { href: sportPath("codeHub"), label: "Code Hub", icon: "#" },
  { href: "/help", label: "Help", icon: "?" },
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
      <Container width="form" className="py-10 sm:py-16 text-center">
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

  const entitlement = await getEntitlement();
  const [subscription, profileResult, preferences, offerState] = await Promise.all([
    getSubscriptionRow(supabase, user.id),
    supabase.from("profiles").select("display_name, created_at").eq("id", user.id).maybeSingle(),
    getPreferencesFor(supabase, user.id),
    offerStateFor(entitlement),
  ]);


  const displayName = profileResult.data?.display_name ?? "";
  const createdAt = profileResult.data?.created_at as string | undefined;
  const hasActiveSubscription = hasLivePaidSubscription(subscription);
  const paid = entitlement.tier !== "free";
  const followed = preferences.leagues
    .map(leagueByCode)
    .filter((l): l is NonNullable<typeof l> => l !== undefined);

  return (
    <Container width="shell" className="py-4 sm:py-10">
      {/* Who and what: the person, their plan, and the four places they go most. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="card flex items-center gap-4 p-5 sm:p-6">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand/15 font-display text-2xl font-bold text-brand"
          >
            {(displayName || user.email || "?").trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-[28px]">
              {displayName ? `Hi, ${displayName}` : "Your account"}
            </h1>
            <p className="truncate text-sm text-ink-muted">{user.email}</p>
            {createdAt && (
              <p className="mt-0.5 text-xs text-ink-dim">
                Member since {new Date(createdAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" })}
              </p>
            )}
          </div>
        </div>

        <PlanCard tier={entitlement.tier} offer={offerState} passOnly={Boolean(entitlement.passOnly)} />
      </div>

      <nav aria-label="Shortcuts" className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="card card-hover flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center sm:flex-row sm:gap-2.5 sm:py-4"
          >
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-surface-2 font-mono text-sm font-bold text-ink">
              {q.icon}
            </span>
            <span className="text-[12px] font-semibold leading-tight text-ink sm:text-sm">{q.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        <AccountSectionNav sections={SECTIONS} />
      </div>

      {/*
        Someone who skipped the questionnaire (or went straight to a checkout)
        gets one unobtrusive offer to finish it, rather than being redirected
        into it on every visit.
      */}
      {!hasOnboarded(preferences) && (
        <div className="card mt-6 flex flex-wrap items-center gap-4 border-brand/25 p-5">
          <div className="min-w-[14rem] flex-1">
            <p className="text-sm font-semibold">Make the feed yours</p>
            <p className="mt-1 text-xs text-ink-muted">Three taps: your leagues lead everything you see.</p>
          </div>
          <ButtonLink href="/onboarding?next=/account" variant="secondary" className="px-4 py-2">
            Set it up
          </ButtonLink>
        </div>
      )}

      <section id="overview" className="scroll-mt-[calc(var(--header-h)+4rem)] pt-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Leagues followed"
            value={String(followed.length)}
            sublabel={followed.length > 0 ? followed.map((l) => l.shortName).join(", ") : "Pick some under Feed."}
          />
          <StatCard
            label="You use it for"
            value={preferences.usageIntent ? INTENT_LABEL[preferences.usageIntent] : "—"}
            sublabel="Decides which numbers lead."
          />
          <StatCard label="Plan" value={TIER_LABEL[entitlement.tier]} sublabel={paid ? "Billing, invoices and cancelling live under Manage plan." : "Every match and 27 competitions, free."} />
        </div>
      </section>

      <section id="preferences" className="scroll-mt-[calc(var(--header-h)+4rem)] pt-14">
        <SectionHeading
          eyebrow="Feed"
          title="Your feed and your details"
          description="Shapes what you see first."
        />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="card p-5 sm:p-7">
            <PreferencesForm leagues={LEAGUES} preferences={preferences} />
          </div>
          <div className="card p-5 sm:p-7">
            <h3 className="mb-4 text-sm font-semibold">Your details</h3>
            <ProfileForm initialDisplayName={displayName} />
          </div>
        </div>
      </section>

      <section id="notifications" className="scroll-mt-[calc(var(--header-h)+4rem)] pt-14">
        <SectionHeading
          eyebrow="Notifications"
          title="On this device"
          description="Set per device."
        />
        <div className="card mt-6 max-w-2xl p-5 sm:p-7">
          <NotificationControls />
        </div>
      </section>

      <section id="security" className="scroll-mt-[calc(var(--header-h)+4rem)] pt-14">
        <SectionHeading eyebrow="Security" title="Login & security" />
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="card divide-y divide-line p-5 sm:p-7">
            <div className="pb-6">
              <h3 className="mb-4 text-sm font-semibold">Change email</h3>
              <ChangeEmailForm currentEmail={user.email ?? ""} />
            </div>
            <div className="pt-6">
              <h3 className="mb-4 text-sm font-semibold">Change password</h3>
              <ChangePasswordForm />
            </div>
          </div>

          <div className="card p-5 sm:p-7">
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

            <details className="group mt-6 border-t border-line pt-5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-rose marker:hidden">
                Delete account <span className="text-ink-dim group-open:hidden">›</span>
              </summary>
              <div className="mt-4">
                <DeleteAccountForm hasActiveSubscription={hasActiveSubscription} />
              </div>
            </details>

            <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-ink-dim">
              Need a hand?{" "}
              <Link href="/responsible-use" className="underline underline-offset-2">
                Responsible use resources
              </Link>{" "}
              are always available.
            </p>
          </div>
        </div>
      </section>

    </Container>
  );
}
