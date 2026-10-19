import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack/client";
import { nextPeriodEnd } from "@/lib/flutterwave/period";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/email-templates";
import type { BillingCycle } from "@/lib/pricing";

export type OnceOutcome = "granted" | "already" | "pending" | "failed" | "unknown";

/** Plan column of a pay-once checkout: "pro:monthly:once". */
export const ONCE_SUFFIX = ":once";

export function isOncePlan(plan: string | null | undefined): boolean {
  return typeof plan === "string" && plan.endsWith(ONCE_SUFFIX);
}

/**
 * Turns one pay-once Paystack payment into a prepaid Pro or VIP period, at
 * most once.
 *
 * A checkout without a plan is what lets Paystack show every method (bank
 * transfer, OPay, PalmPay, USSD, pay with bank, card), since a plan can only
 * be renewed from a card. Called by the webhook and by the callback page,
 * whichever comes first. The transaction is re-read from Paystack by our own
 * reference and checked against the payments row written at checkout before
 * any time is granted; the period stacks like a Flutterwave one
 * (flutterwave/period.ts).
 */
export async function grantPaystackOnce(reference: string): Promise<OnceOutcome> {
  const admin = supabaseAdmin();
  const { data: payment } = await admin
    .from("payments")
    .select("id, user_id, plan, status, amount_kobo, provider")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!payment || payment.provider !== "paystack" || !isOncePlan(payment.plan)) return "unknown";
  if (payment.status === "success") return "already";

  let tx;
  try {
    tx = await verifyTransaction(reference);
  } catch {
    return "pending";
  }
  if (tx.status === "failed" || tx.status === "abandoned") {
    // Abandoned can still be paid later on a bank transfer; only a hard failure is final.
    if (tx.status === "failed") {
      await admin.from("payments").update({ status: "failed", raw_event: tx }).eq("id", payment.id).neq("status", "success");
      return "failed";
    }
    return "pending";
  }
  if (tx.status !== "success") return "pending";
  if (tx.reference !== reference || !(tx.amount >= Number(payment.amount_kobo))) {
    await admin.from("payments").update({ status: "failed", raw_event: { mismatch: true, tx } }).eq("id", payment.id).neq("status", "success");
    return "failed";
  }

  // Only one of webhook / callback wins this update, so time is granted once.
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
      provider: "paystack_once",
      paystack_subscription_code: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );

  const email = tx.customer?.email;
  if (email) {
    void sendEmail({
      to: email,
      ...receiptEmail({ tier, amountKobo: tx.amount, accessUntil: until, reference, date: now.toISOString() }),
    });
  }
  return "granted";
}
