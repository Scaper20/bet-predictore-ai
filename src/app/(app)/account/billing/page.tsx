import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/entitlements";
import { BillingPlans } from "@/components/billing/billing-plans";

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
        <BillingPlans currentTier={entitlement.tier} />
      </div>
    </div>
  );
}
