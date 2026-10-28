import "server-only";

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimPaystackPayment, type OnceOutcome } from "@/lib/paystack/once";
import { recordCommission } from "@/lib/partner-commission";
import { sendEmail } from "@/lib/email";
import { receiptEmail } from "@/lib/email-templates";
import type { Entitlement } from "@/lib/entitlements";
import {
  DAY_PASS_PLAN,
  FIRST_SEEN_COOKIE,
  dayPassExpiry,
  firstSeenFrom,
  offerDeadline,
  type DayPassState,
} from "@/lib/day-pass";

export interface DayPassRow {
  expiresAt: string;
}

/** The account's day pass, live or spent, or null if it never bought one. */
export async function dayPassFor(userId: string): Promise<DayPassRow | null> {
  const { data } = await supabaseAdmin().from("day_passes").select("expires_at").eq("user_id", userId).maybeSingle();
  return data ? { expiresAt: data.expires_at as string } : null;
}

async function accountCreatedMs(userId: string): Promise<number | null> {
  const { data } = await supabaseAdmin().from("profiles").select("created_at").eq("id", userId).maybeSingle();
  const ms = data?.created_at ? Date.parse(data.created_at as string) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Where this visitor stands with the day pass: offered (and until when),
 * running, or neither. A signed-out visitor's window comes from the
 * first-visit cookie alone; a signed-in one's also from the account's age.
 * Anyone already on Pro or VIP is never offered it.
 */
export async function dayPassState(ent: Entitlement, now = Date.now()): Promise<DayPassState> {
  const firstSeen = firstSeenFrom((await cookies()).get(FIRST_SEEN_COOKIE)?.value, now);
  if (!ent.userId) {
    const deadline = offerDeadline(firstSeen, null);
    return deadline && deadline > now ? { state: "offer", deadline: new Date(deadline).toISOString(), signedIn: false } : { state: "none" };
  }
  const [pass, created] = await Promise.all([dayPassFor(ent.userId), accountCreatedMs(ent.userId)]);
  if (pass) return Date.parse(pass.expiresAt) > now ? { state: "active", until: pass.expiresAt } : { state: "none" };
  if (ent.tier === "pro" || ent.tier === "vip") return { state: "none" };
  const deadline = offerDeadline(firstSeen, created);
  return deadline && deadline > now ? { state: "offer", deadline: new Date(deadline).toISOString(), signedIn: true } : { state: "none" };
}

/**
 * Turns a paid day-pass checkout into 24 hours of VIP, once. Called by the
 * webhook and the callback page, whichever comes first; the payment is
 * re-verified with Paystack before anything is granted (claimPaystackPayment).
 * A second paid pass on the same account (two checkouts opened side by side)
 * extends the first by a day rather than being lost.
 */
export async function grantDayPass(reference: string): Promise<OnceOutcome> {
  const claim = await claimPaystackPayment(reference, (plan) => plan === DAY_PASS_PLAN);
  if (claim.outcome !== "claimed") return claim.outcome;
  const { payment, tx } = claim;
  const admin = supabaseAdmin();
  const now = new Date();

  const existing = await dayPassFor(payment.user_id);
  const from = existing && Date.parse(existing.expiresAt) > now.getTime() ? new Date(existing.expiresAt) : now;
  const expiresAt = dayPassExpiry(from).toISOString();
  if (existing) {
    await admin.from("day_passes").update({ expires_at: expiresAt, paystack_reference: reference }).eq("user_id", payment.user_id);
  } else {
    await admin.from("day_passes").insert({ user_id: payment.user_id, paystack_reference: reference, starts_at: now.toISOString(), expires_at: expiresAt });
  }

  await recordCommission({
    userId: payment.user_id,
    reference,
    provider: "paystack",
    plan: DAY_PASS_PLAN,
    currency: tx.currency ?? "NGN",
    grossMinor: tx.amount,
    feeMinor: typeof tx.fees === "number" ? tx.fees : null,
    paidAt: now,
  });

  const email = tx.customer?.email;
  if (email) {
    void sendEmail({
      to: email,
      ...receiptEmail({ tier: "vip", planLabel: "VIP day pass", amountKobo: tx.amount, accessUntil: expiresAt, reference, date: now.toISOString() }),
    });
  }
  return "granted";
}
