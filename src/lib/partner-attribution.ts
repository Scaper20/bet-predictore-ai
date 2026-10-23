import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parsePartnerRef } from "@/lib/partner-ref";
import { recordCommission } from "@/lib/partner-commission";

/**
 * Credits a brand-new account to the partner whose link its owner first
 * clicked, if that click was within 90 days and the account was created after
 * it. Server-side with the service role: a user cannot set this on
 * themselves (guard_profile_referral). Best-effort and idempotent: an account
 * already credited is never changed, a suspended partner earns nothing, and
 * a partner's own account is never credited to them.
 */
export async function attributeSignup(userId: string, cookieValue: string | null | undefined): Promise<boolean> {
  try {
    const ref = parsePartnerRef(cookieValue);
    if (!ref) return false;
    const admin = supabaseAdmin();

    const [{ data: partner }, { data: profile }] = await Promise.all([
      admin.from("partners").select("id, status, user_id").eq("slug", ref.slug).maybeSingle(),
      admin.from("profiles").select("created_at, referred_by_partner").eq("id", userId).maybeSingle(),
    ]);
    if (!partner || partner.status !== "active" || partner.user_id === userId) return false;
    if (!profile || profile.referred_by_partner) return false;
    // Existing accounts are not attributable: it must have been created after the click.
    if (Date.parse(profile.created_at as string) < ref.clickedAt - 60_000) return false;

    const { data: updated } = await admin
      .from("profiles")
      .update({ referred_by_partner: partner.id, referred_at: new Date().toISOString() })
      .eq("id", userId)
      .is("referred_by_partner", null)
      .select("id");
    return (updated ?? []).length > 0;
  } catch {
    // Attribution must never break a signup.
    return false;
  }
}

/**
 * Pays the partner their share of every payment this user made before the
 * account was credited to them: a referral picked up late (the Google
 * sign-in that skipped /auth/callback, or one an admin credits by hand)
 * still earns on what was already paid. recordCommission keys on the
 * payment reference, so running this twice pays nothing twice.
 */
export async function creditPastPayments(userId: string): Promise<number> {
  const { data: payments } = await supabaseAdmin()
    .from("payments")
    .select("paystack_reference, provider, plan, currency, amount_minor, amount_kobo, created_at")
    .eq("user_id", userId)
    .eq("status", "success");
  let n = 0;
  for (const p of payments ?? []) {
    const gross = (p.amount_minor ?? p.amount_kobo) as number | null;
    if (!p.paystack_reference || !gross) continue;
    await recordCommission({
      userId,
      reference: p.paystack_reference as string,
      provider: p.provider === "flutterwave" ? "flutterwave" : "paystack",
      plan: (p.plan as string | null) ?? null,
      currency: (p.currency as string | null) ?? "NGN",
      grossMinor: gross,
      paidAt: new Date(p.created_at as string),
    });
    n += 1;
  }
  return n;
}
