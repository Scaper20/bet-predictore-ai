import { NextResponse } from "next/server";
import { sendCheckoutReminders } from "@/lib/checkout-recovery";
import { sendRenewalReminders } from "@/lib/renewal-reminders";
import { expireStalePendingPayments } from "@/lib/payments-feed";
import { checkPaystackSubscriptions } from "@/lib/paystack/subscription-check";

// Node-only (Supabase service-role client), same as the other cron routes;
// Proxy (formerly middleware) never touches /api/ at all.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily sweep for checkout attempts that never got a Paystack webhook at
 * all — see src/lib/payments-feed.ts for the threshold and why 24h is
 * safe. Wired up via vercel.json alongside settle-predictions/
 * whatsapp-digest; Hobby's once-a-day cap is fine here since this is a
 * backstop for silence, not something that needs to run often.
 *
 * Same CRON_SECRET gate as the other cron routes — required, not optional,
 * because this writes to the DB.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { expired } = await expireStalePendingPayments();
  // Then one reminder to people who left checkout in the last two days.
  const reminders = await sendCheckoutReminders().catch(() => ({ candidates: 0, sent: 0 }));
  // And one heads-up to pay-once members whose plan ends in the next few days.
  const renewals = await sendRenewalReminders().catch(() => ({ candidates: 0, sent: 0 }));
  // And every card subscription against Paystack, so a missed renewal webhook
  // is caught the next morning rather than by the member (lib/paystack/subscription-check.ts).
  const subscriptions = await checkPaystackSubscriptions()
    .then((r) => ({ checked: r.checked, healed: r.healed, tidied: r.tidied, findings: r.findings.length, errors: r.errors }))
    .catch(() => ({ checked: 0, healed: 0, tidied: 0, findings: 0, errors: 1 }));
  return NextResponse.json({ expired, reminders, renewals, subscriptions });
}
