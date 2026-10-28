import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getEntitlement } from "@/lib/entitlements";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack/client";
import { nairaToKobo } from "@/lib/paystack/money";
import { SITE_URL as SITE } from "@/lib/site-url";
import { DAY_PASS_PLAN, DAY_PASS_PRICE_NAIRA } from "@/lib/day-pass";
import { dayPassState } from "@/lib/day-pass-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Where this visitor stands with the VIP day pass (lib/day-pass.ts), for the offer on the page. */
export async function GET() {
  const ent = await getEntitlement();
  return NextResponse.json(await dayPassState(ent), { headers: NO_STORE });
}

/**
 * Starts a day-pass checkout: signed in, inside the offer window, never had
 * one. A one-off Paystack payment (every method: transfer, OPay, PalmPay,
 * USSD, card); the webhook or the callback page grants it (grantDayPass).
 */
export async function POST() {
  const ent = await getEntitlement();
  if (!ent.userId || !ent.email) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });

  const state = await dayPassState(ent);
  if (state.state === "active") return NextResponse.json({ error: "Your day pass is already running." }, { status: 409, headers: NO_STORE });
  if (state.state !== "offer") {
    return NextResponse.json({ error: "The day pass is for new members in their first 24 hours." }, { status: 409, headers: NO_STORE });
  }

  const reference = `kiqstat_day_${ent.userId}_${randomUUID()}`;
  const amountKobo = nairaToKobo(DAY_PASS_PRICE_NAIRA);
  let init;
  try {
    init = await initializeTransaction({
      email: ent.email,
      amountKobo,
      reference,
      callbackUrl: `${SITE}/account/billing/callback`,
      metadata: { userId: ent.userId, tier: "vip", dayPass: "1" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start checkout." }, { status: 502, headers: NO_STORE });
  }

  // The row grantDayPass checks the paid amount against; service role, as for every payments write.
  await supabaseAdmin().from("payments").insert({
    user_id: ent.userId,
    paystack_reference: reference,
    amount_kobo: amountKobo,
    plan: DAY_PASS_PLAN,
    status: "pending",
  });

  return NextResponse.json({ authorization_url: init.authorization_url }, { headers: NO_STORE });
}
