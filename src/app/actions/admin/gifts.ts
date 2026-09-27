"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin, logAdminAction } from "@/lib/admin";
import { grantSubscriptionGift } from "@/lib/subscription-gifts-feed";
import { sendEmail } from "@/lib/email";
import { giftSubscriptionEmail } from "@/lib/email-templates";

export type GiftActionState = { error: string | null; message: string | null };

const GIFTABLE_TIERS = new Set(["pro", "vip"]);
const MONTH_OPTIONS = new Set([1, 3, 6, 12]);

/**
 * Admin-only "give a friend a free month to test" grant. Never touches
 * `subscriptions` (the Paystack-billing record) — writes a row to
 * subscription_gifts instead, which getEntitlement() folds in as a
 * temporary tier boost. See subscription_gifts migration for why.
 */
export async function grantGift(_prev: GiftActionState, formData: FormData): Promise<GiftActionState> {
  const gate = await checkAdmin();
  if (!gate.ok) return { error: gate.error, message: null };

  const userId = String(formData.get("userId") ?? "");
  const userEmail = String(formData.get("userEmail") ?? "");
  const tier = String(formData.get("tier") ?? "");
  const months = Number(formData.get("months") ?? 0);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!userId || !userEmail) return { error: "Missing account.", message: null };
  if (!GIFTABLE_TIERS.has(tier)) return { error: "Pick Pro or VIP.", message: null };
  if (!MONTH_OPTIONS.has(months)) return { error: "Pick a valid duration.", message: null };

  const tierTyped = tier as "pro" | "vip";
  const result = await grantSubscriptionGift({
    userId,
    tier: tierTyped,
    months,
    note,
    grantedByEmail: gate.identity.email,
  });
  if (result.error || !result.expiresAt) {
    return { error: result.error ?? "Couldn't grant the gift. Try again.", message: null };
  }

  const email = giftSubscriptionEmail({ tier: tierTyped, months, expiresAt: result.expiresAt, note });
  void sendEmail({ to: userEmail, subject: email.subject, html: email.html });

  await logAdminAction(gate.identity, "subscription_gift.granted", userEmail, { tier, months });

  revalidatePath("/admin/users");
  return {
    error: null,
    message: `Gifted ${months === 1 ? "1 month" : `${months} months`} of ${tierTyped.toUpperCase()} to ${userEmail}.`,
  };
}
