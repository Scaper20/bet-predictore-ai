import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Paystack authorization URLs are single-use and short-lived — a checkout
 * still "pending" a full day after it started has been abandoned (tab
 * closed, card page never finished), not merely slow. Safe to be this
 * generous with the threshold: a genuinely delayed charge.success webhook
 * still matches by paystack_reference and unconditionally overwrites
 * status back to "success" whenever it does arrive (see
 * src/app/api/billing/webhook/route.ts), so marking a row "failed" here is
 * reversible, not a real risk of hiding a real payment.
 */
const PENDING_EXPIRY_HOURS = 24;

/**
 * Marks any `payments` row still "pending" past the threshold as "failed".
 * Real failures (Paystack's own charge.failed event) are already caught
 * immediately by the webhook — this is the backstop for checkouts that
 * never got a webhook at all, not the primary path. Safe to call anytime:
 * a re-run with nothing stale just updates zero rows. Called by both the
 * daily cron (api/cron/expire-pending-payments) and the admin panel's
 * manual "expire now" button, same two-entry-point shape as the WhatsApp
 * digest's cron + regenerate button.
 */
export async function expireStalePendingPayments(now: Date = new Date()): Promise<{ expired: number }> {
  const cutoff = new Date(now.getTime() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("payments")
    .update({ status: "failed" })
    .eq("status", "pending")
    .lt("created_at", cutoff.toISOString())
    .select("id");

  if (error) return { expired: 0 };
  return { expired: (data ?? []).length };
}
