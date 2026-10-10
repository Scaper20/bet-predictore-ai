import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyByReference } from "@/lib/flutterwave/client";
import { nextPeriodEnd } from "@/lib/flutterwave/period";
import { formatMoney } from "@/lib/payments/markets";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/email-templates";
import type { BillingCycle } from "@/lib/pricing";

export type GrantOutcome = "granted" | "already" | "pending" | "failed" | "unknown";

/**
 * Turns one Flutterwave payment into access, at most once.
 *
 * Called by the webhook and by the page Flutterwave redirects back to,
 * whichever comes first; both may fire, so it must be idempotent. Nothing
 * from the caller is trusted: the transaction is re-read from Flutterwave
 * by our own reference and checked against the payments row written at
 * checkout (amount, currency, reference) before any time is granted.
 */
export async function grantFlutterwavePayment(txRef: string): Promise<GrantOutcome> {
  const admin = supabaseAdmin();
  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, plan, status, currency, amount_minor, provider")
    .eq("paystack_reference", txRef)
    .maybeSingle();
  if (!payment || payment.provider !== "flutterwave") return "unknown";
  if (payment.status === "success") return "already";

  let tx;
  try {
    tx = await verifyByReference(txRef);
  } catch {
    return "pending"; // Flutterwave unreachable or not settled yet; the webhook or a reload retries.
  }

  const expected = Number(payment.amount_minor ?? 0) / 100;
  if (tx.status === "failed" || tx.status === "cancelled") {
    await admin.from("payments").update({ status: "failed", raw_event: tx }).eq("id", payment.id).neq("status", "success");
    return "failed";
  }
  if (tx.status !== "successful") return "pending";
  if (tx.tx_ref !== txRef || tx.currency !== payment.currency || !(tx.amount >= expected)) {
    // A payment for less than the plan, or in another currency: record it,
    // grant nothing, and leave it for a person to look at.
    await admin.from("payments").update({ status: "failed", raw_event: { mismatch: true, tx } }).eq("id", payment.id).neq("status", "success");
    return "failed";
  }

  // Claim the payment. Only one caller's update matches a row not yet
  // marked success, so only one of webhook / redirect grants the time.
  const { data: claimed } = await admin
    .from("payments")
    .update({ status: "success", raw_event: tx })
    .eq("id", payment.id)
    .neq("status", "success")
    .select("id");
  if (!claimed || claimed.length === 0) return "already";

  const [tier, cycle] = String(payment.plan).split(":") as ["pro" | "vip", BillingCycle];
  const now = new Date();
  const { data: current } = await admin
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("user_id", payment.user_id)
    .maybeSingle();
  const until = nextPeriodEnd(current, tier, cycle, now).toISOString();

  await admin.from("subscriptions").upsert(
    {
      user_id: payment.user_id,
      tier,
      status: "active",
      current_period_end: until,
      provider: "flutterwave",
      // A prepaid period has no Paystack subscription behind it.
      paystack_subscription_code: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );

  const email = tx.customer?.email;
  if (email) {
    void sendEmail({
      to: email,
      ...receiptEmail({
        tier,
        amountKobo: 0,
        amountText: formatMoney(tx.amount, tx.currency),
        accessUntil: until,
        reference: txRef,
        date: now.toISOString(),
      }),
    });
  }
  return "granted";
}
