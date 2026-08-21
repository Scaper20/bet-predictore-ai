import "server-only";

import type { supabaseServer } from "@/lib/supabase/server";
import type { Tier } from "@/lib/entitlements";

export interface SubscriptionRow {
  tier: Tier;
  status: "active" | "past_due" | "cancelled" | "none";
  paystack_subscription_code: string | null;
  current_period_end: string | null;
  pass_expires_at: string | null;
}

/** Raw `subscriptions` row for the signed-in user, or null. Pass an
 * RLS-scoped client — `subscriptions_select_own` permits this read. */
export async function getSubscriptionRow(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
): Promise<SubscriptionRow | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("tier, status, paystack_subscription_code, current_period_end, pass_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * True when the user has a live (not cancelled/lapsed) Pro/VIP Paystack
 * subscription — the case that must block starting a second one via
 * checkout, and must be resolved (via Manage Subscription) before deleting
 * the account. Weekend Pass never counts here — it's a one-off charge with
 * no recurring subscription behind it, not a "live subscription" to cancel.
 */
export function hasLivePaidSubscription(row: SubscriptionRow | null): boolean {
  return !!row && (row.tier === "pro" || row.tier === "vip") && (row.status === "active" || row.status === "past_due");
}
