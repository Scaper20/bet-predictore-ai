import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";
import { BillingPlans } from "@/components/billing/billing-plans";
import { ManageSubscriptionButton } from "@/components/billing/manage-subscription-button";
import { BillingHistory, type PaymentRow } from "@/components/billing/billing-history";
import { SectionHeading } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Plans & billing" };

export default async function BillingPage() {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
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
    .select("id, created_at, plan, amount_kobo, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const hasActiveSubscription = hasLivePaidSubscription(subscription);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-bold">Plans &amp; billing</h1>
        <p className="mt-3 text-sm text-ink-muted">
          From a single matchday to a full season. Payments are handled by Paystack — cancel a subscription anytime
          from here.
        </p>
      </div>
      <div className="mt-10">
        <BillingPlans currentTier={entitlement.tier} hasActiveSubscription={hasActiveSubscription} />
      </div>

      {(entitlement.tier === "pro" || entitlement.tier === "vip") && subscription?.paystack_subscription_code && (
        <section className="mt-14">
          <SectionHeading
            eyebrow="Subscription"
            title="Manage your plan"
            description="Update your card or cancel anytime — you'll be redirected to Paystack's secure page."
          />
          <div className="card mt-4 p-7">
            <ManageSubscriptionButton />
          </div>
        </section>
      )}

      {entitlement.tier === "pass" && (
        <section className="mt-14">
          <SectionHeading
            eyebrow="Subscription"
            title="Weekend Pass"
            description="This is a one-time purchase, not a subscription — there's nothing to cancel, and it won't renew or charge you again."
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
