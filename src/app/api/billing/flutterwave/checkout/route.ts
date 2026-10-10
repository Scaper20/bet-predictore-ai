import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPaymentLink, flutterwaveConfigured } from "@/lib/flutterwave/client";
import { canBuy } from "@/lib/flutterwave/period";
import { marketFor, marketPrice } from "@/lib/payments/markets";
import { CYCLE_LABEL, planById, type BillingCycle } from "@/lib/pricing";
import { SITE_URL as SITE } from "@/lib/site-url";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];

/**
 * Starts a Flutterwave checkout: a prepaid Pro or VIP period, priced and paid
 * in the payer's own currency (lib/payments/markets.ts). The payment is
 * granted by lib/flutterwave/grant.ts once Flutterwave confirms it.
 */
export async function POST(request: Request) {
  if (!flutterwaveConfigured()) {
    return NextResponse.json({ error: "Payments outside Nigeria aren't switched on yet." }, { status: 503 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { tier?: string; cycle?: string; country?: string };
  const tier = body.tier;
  if (tier !== "pro" && tier !== "vip") return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  const cycle: BillingCycle = CYCLES.includes(body.cycle as BillingCycle) ? (body.cycle as BillingCycle) : "monthly";

  const market = marketFor(body.country);
  if (market.provider !== "flutterwave") {
    return NextResponse.json({ error: "Payments in Nigeria go through Paystack." }, { status: 400 });
  }
  const amount = marketPrice(market, tier, cycle);
  if (!amount) return NextResponse.json({ error: "This plan has no price here yet." }, { status: 500 });

  const existing = await getSubscriptionRow(supabase, user.id);
  // A running Paystack subscription would keep billing alongside a prepaid
  // period; it has to be cancelled first, same rule as a second Paystack plan.
  if (hasLivePaidSubscription(existing)) {
    return NextResponse.json(
      { error: "You already have an active subscription. Cancel it from Manage subscription before switching." },
      { status: 409 },
    );
  }
  const allowed = canBuy(existing, tier, new Date());
  if (!allowed.ok) return NextResponse.json({ error: allowed.reason }, { status: 409 });

  const txRef = `betrix_fw_${user.id}_${randomUUID()}`;
  const plan = planById(tier);

  // The row the grant checks the paid amount and currency against, and what
  // makes it idempotent. Written before the payer can pay: without it a
  // payment couldn't be granted. Service role, as for Paystack checkouts. A
  // checkout abandoned from here is expired after 24h like any other.
  const { error: recordError } = await supabaseAdmin()
    .from("payments")
    .insert({
      user_id: user.id,
      paystack_reference: txRef,
      provider: "flutterwave",
      currency: market.currency,
      amount_minor: Math.round(amount * 100),
      // Revenue figures are in naira; a foreign-currency payment adds 0 there.
      amount_kobo: 0,
      plan: `${tier}:${cycle}`,
      status: "pending",
    });
  if (recordError) return NextResponse.json({ error: "Could not start checkout. Try again." }, { status: 500 });

  let link: string;
  try {
    link = await createPaymentLink({
      txRef,
      amount,
      currency: market.currency,
      // No query string of ours: Flutterwave appends status, tx_ref and
      // transaction_id, and the callback recognises our tx_ref prefix.
      redirectUrl: `${SITE}/account/billing/callback`,
      email: user.email,
      methods: market.methods,
      meta: { userId: user.id, tier, cycle, country: market.country },
      description: `${plan.name}, ${CYCLE_LABEL[cycle].name.toLowerCase()}`,
    });
  } catch (error) {
    await supabaseAdmin().from("payments").update({ status: "failed" }).eq("paystack_reference", txRef);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start checkout." },
      { status: 502 },
    );
  }
  return NextResponse.json({ authorization_url: link });
}
