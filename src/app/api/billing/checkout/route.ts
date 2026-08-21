import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack/client";
import { planCodeFor } from "@/lib/paystack/plan-codes";
import { nairaToKobo } from "@/lib/paystack/money";
import { planById } from "@/lib/pricing";

type Cycle = "monthly" | "yearly";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://betrix.ai").replace(/\/$/, "");

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const body = (await request.json()) as { tier?: string; cycle?: Cycle };
  const tier = body.tier;
  const cycle: Cycle = body.cycle === "yearly" ? "yearly" : "monthly";

  if (tier !== "pass" && tier !== "pro" && tier !== "vip") {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const plan = planById(tier);
  const amountNaira =
    tier === "pass" ? (plan.price.oneOff ?? 0) : cycle === "yearly" ? (plan.price.yearly ?? 0) : (plan.price.monthly ?? 0);

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
      metadata: { userId: user.id, tier, cycle },
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
      plan: `${tier}:${cycle}`,
      status: "pending",
    });

  return NextResponse.json({ authorization_url: init.authorization_url });
}
