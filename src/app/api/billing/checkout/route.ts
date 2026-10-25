import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack/client";
import { planCodeFor } from "@/lib/paystack/plan-codes";
import { nairaToKobo } from "@/lib/paystack/money";
import { cyclePrice, planById, type BillingCycle } from "@/lib/pricing";
import { SITE_URL as SITE } from "@/lib/site-url";
import { getSubscriptionRow, hasLivePaidSubscription, prepaidUntil } from "@/lib/subscriptions";
import { canBuy } from "@/lib/flutterwave/period";
import { ONCE_SUFFIX } from "@/lib/paystack/once";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // A garbled or empty body reads as no plan chosen, refused below, rather than a crash.
  const body = ((await request.json().catch(() => null)) ?? {}) as { tier?: unknown; cycle?: unknown; once?: unknown };
  const tier = body.tier;
  // Pay once: a prepaid period with no Paystack plan, so the checkout offers
  // every method (bank transfer, OPay, PalmPay, USSD, pay with bank, card).
  // A plan checkout can only be renewed from a card, and hides the rest.
  const once = body.once === true;
  const cycle: BillingCycle = CYCLES.includes(body.cycle as BillingCycle) ? (body.cycle as BillingCycle) : "monthly";

  // Passes were withdrawn in October 2026; a stale page asking for one is
  // refused rather than quietly sold Pro.
  if (tier !== "pro" && tier !== "vip") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  // subscriptions is unique on user_id, so a second checkout while one is
  // already live would leave a second, still-billing Paystack subscription
  // running while our DB silently overwrites to only track the newest one.
  // Cancelling the old one first (via Manage Subscription) avoids that.
  const existing = await getSubscriptionRow(supabase, user.id);
  if (hasLivePaidSubscription(existing)) {
    return NextResponse.json(
      {
        error: "You already have an active subscription. Cancel it from Manage subscription before switching plans.",
      },
      { status: 409 }
    );
  }

  if (once) {
    const allowed = canBuy(existing, tier, new Date());
    if (!allowed.ok) return NextResponse.json({ error: allowed.reason }, { status: 409 });
  }

  // A subscription would replace a prepaid period on the same row and throw
  // away the days left on it. Paying once instead adds time to it.
  const prepaid = once ? null : prepaidUntil(existing);
  if (prepaid) {
    const date = prepaid.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return NextResponse.json(
      { error: `Your plan is paid up until ${date}. You can start a subscription when it ends.` },
      { status: 409 }
    );
  }

  const plan = planById(tier);
  const amountNaira = cyclePrice(plan, cycle) ?? 0;

  if (amountNaira <= 0) {
    return NextResponse.json({ error: "This plan has no price configured." }, { status: 500 });
  }

  const reference = `betrix_${user.id}_${randomUUID()}`;

  let init;
  try {
    init = await initializeTransaction({
      email: user.email,
      amountKobo: nairaToKobo(amountNaira),
      reference,
      callbackUrl: `${SITE}/account/billing/callback`,
      planCode: once ? undefined : planCodeFor(tier, cycle),
      metadata: once ? { userId: user.id, tier, cycle, once: "1" } : { userId: user.id, tier, cycle },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start checkout." },
      { status: 502 }
    );
  }

  // Recorded via the service-role client: `payments` has no INSERT policy for
  // the `authenticated` role (see supabase/migrations/0001_init.sql) — writes
  // to entitlement-adjacent tables only ever come from trusted server code
  // that has already verified the session, never from the user's own RLS
  // context. This row is what makes the webhook idempotent on redelivery.
  await supabaseAdmin()
    .from("payments")
    .insert({
      user_id: user.id,
      paystack_reference: reference,
      amount_kobo: nairaToKobo(amountNaira),
      plan: `${tier}:${cycle}${once ? ONCE_SUFFIX : ""}`,
      status: "pending",
    });

  return NextResponse.json({ authorization_url: init.authorization_url });
}
