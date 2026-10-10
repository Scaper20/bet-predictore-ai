import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { getSubscriptionRow, hasLivePaidSubscription, prepaidUntil } from "@/lib/subscriptions";
import { flutterwaveConfigured } from "@/lib/flutterwave/client";
import { MARKETS, NIGERIA, marketFor } from "@/lib/payments/markets";
import { BillingPlans } from "@/components/billing/billing-plans";
import { MarketPicker } from "@/components/billing/market-picker";
import { ManageSubscriptionButton } from "@/components/billing/manage-subscription-button";
import { BillingHistory, type PaymentRow } from "@/components/billing/billing-history";
import { SectionHeading } from "@/components/ui/primitives";
import { availableCycles } from "@/lib/paystack/plan-codes";
import type { BillingCycle } from "@/lib/pricing";

export const metadata: Metadata = { title: "Plans & billing" };

export default async function BillingPage({ searchParams }: PageProps<"/account/billing">) {
  const params = await searchParams;
  const rawCycle = Array.isArray(params.cycle) ? params.cycle[0] : params.cycle;
  const initialCycle: BillingCycle = rawCycle === "quarterly" || rawCycle === "yearly" ? rawCycle : "monthly";
  const rawCountry = Array.isArray(params.country) ? params.country[0] : params.country;
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-16 text-center sm:px-6">
        <h1 className="font-display text-2xl font-bold">Billing isn&apos;t set up yet</h1>
        <p className="mt-2 text-sm text-ink-muted">
          This deployment hasn&apos;t configured Supabase or Paystack. Every free feature still works.
        </p>
      </div>
    );
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login?next=/account/billing");

  const entitlement = await getEntitlement();
  const subscription = await getSubscriptionRow(supabase, user.id);
  const { data: payments } = await supabase
    .from("payments")
    .select("id, created_at, plan, amount_kobo, currency, amount_minor, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const hasActiveSubscription = hasLivePaidSubscription(subscription);

  // Where the payer is decides the currency and the provider: the country
  // they pick, else the one Vercel sees them connect from. Until Flutterwave
  // is configured everyone pays as before, through Paystack in naira.
  const sellsAbroad = flutterwaveConfigured();
  const market = sellsAbroad
    ? marketFor(rawCountry ?? (await headers()).get("x-vercel-ip-country") ?? NIGERIA.country)
    : NIGERIA;
  const prepaidEnd = prepaidUntil(subscription);
  const prepaid =
    prepaidEnd && (subscription?.tier === "pro" || subscription?.tier === "vip")
      ? { tier: subscription.tier, until: prepaidEnd.toISOString() }
      : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16 sm:px-6 lg:px-8">
      {/*
        Billing is its own route because it owns the Paystack callback, which
        means the account page's section rail is not on screen here. This is
        the way back — without it the page is a dead end you have to use the
        browser button to escape.
      */}
      <Link
        href="/account"
        className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        ← Back to account
      </Link>

      <div className="mx-auto mt-8 max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold">Plans &amp; billing</h1>
        <p className="mt-3 text-sm text-ink-muted">
          {market.provider === "flutterwave"
            ? `Pay in ${market.currency} through Flutterwave: ${market.methodsLabel}. Each payment buys a set period — nothing renews or charges you again, so there's nothing to cancel.`
            : "From a single matchday to a full season. Payments are handled by Paystack — cancel a subscription anytime from here."}
        </p>
        {sellsAbroad && (
          <div className="mt-4">
            <MarketPicker
              current={market.country}
              options={MARKETS.map(({ country, label, flag, currency }) => ({ country, label, flag, currency }))}
            />
          </div>
        )}
      </div>
      <div className="mt-10">
        <BillingPlans
          currentTier={entitlement.tier}
          hasActiveSubscription={hasActiveSubscription}
          available={availableCycles()}
          initialCycle={initialCycle}
          market={market}
          prepaid={prepaid}
        />
      </div>

      {prepaid && (
        <section className="mt-14">
          <SectionHeading
            eyebrow="Subscription"
            title={`Your ${prepaid.tier === "vip" ? "VIP" : "Pro"} plan`}
            description={`Paid up until ${new Date(prepaid.until).toLocaleDateString("en-GB", {
              day: "numeric", month: "long", year: "numeric",
            })}. It's prepaid — it won't renew or charge you again. Pay for the same plan any time and the new period starts when this one ends, so you never lose days.`}
          />
        </section>
      )}

      {(entitlement.tier === "pro" || entitlement.tier === "vip") && subscription?.paystack_subscription_code && (
        <section className="mt-14">
          <SectionHeading
            eyebrow="Subscription"
            title="Manage your plan"
            description="Update your card or cancel any time."
          />
          <div className="card mt-4 p-5 sm:p-7">
            <ManageSubscriptionButton />
          </div>
        </section>
      )}

      {entitlement.tier === "pass" && (
        <section className="mt-14">
          <SectionHeading
            eyebrow="Subscription"
            title="Your pass"
            description={`Runs until ${
              subscription?.pass_expires_at
                ? new Date(subscription.pass_expires_at).toLocaleString("en-NG", {
                    timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  }) + " WAT"
                : "the end of your window"
            }. It's a one-time purchase, not a subscription — nothing to cancel, and it won't renew or charge you again. Buying another while it runs never shortens it.`}
          />
        </section>
      )}

      <section className="mt-14">
        <SectionHeading eyebrow="History" title="Billing history" />
        <div className="mt-4">
          <BillingHistory payments={(payments ?? []) as PaymentRow[]} />
        </div>
      </section>
    </div>
  );
}
