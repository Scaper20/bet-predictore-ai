import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack/client";
import { planCodeFor } from "@/lib/paystack/plan-codes";
import { nairaToKobo } from "@/lib/paystack/money";
import { cyclePrice, passOption, planById, type BillingCycle } from "@/lib/pricing";
import { SITE_URL as SITE } from "@/lib/site-url";
import { getSubscriptionRow, hasLivePaidSubscription } from "@/lib/subscriptions";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await request.json()) as { tier?: string; cycle?: string; pass?: string };
  const tier = body.tier;
  const cycle: BillingCycle = CYCLES.includes(body.cycle as BillingCycle) ? (body.cycle as BillingCycle) : "monthly";
  const pass = passOption(body.pass);

  if (tier !== "pass" && tier !== "pro" && tier !== "vip") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  // subscriptions is unique on user_id, so a second checkout while one is
  // already live would leave a second, still-billing Paystack subscription
  // running while our DB silently overwrites to only track the newest one.
  // Cancelling the old one first (via Manage Subscription) avoids that.
  //
  // Passes are refused too: the pass is written into the same row, and would
  // overwrite a live Pro or VIP subscription with a shorter, lower tier.
  const existing = await getSubscriptionRow(supabase, user.id);
  if (hasLivePaidSubscription(existing)) {
    return NextResponse.json(
      {
        error:
          tier === "pass"
            ? "Your subscription already includes everything a pass does."
            : "You already have an active subscription. Cancel it from Manage subscription before switching plans.",
      },
      { status: 409 }
    );
  }

  const plan = planById(tier);
  const amountNaira = tier === "pass" ? pass.price : (cyclePrice(plan, cycle) ?? 0);

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
      planCode: tier === "pass" ? undefined : planCodeFor(tier, cycle),
      metadata: { userId: user.id, tier, cycle, ...(tier === "pass" ? { pass: pass.id } : {}) },
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
      plan: tier === "pass" ? `pass:${pass.id}` : `${tier}:${cycle}`,
      status: "pending",
    });

  return NextResponse.json({ authorization_url: init.authorization_url });
}
