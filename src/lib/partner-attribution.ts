import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { parsePartnerRef } from "@/lib/partner-ref";

/**
 * Credits a brand-new account to the partner whose link its owner first
 * clicked, if that click was within 90 days and the account was created after
 * it. Server-side with the service role: a user cannot set this on
 * themselves (guard_profile_referral). Best-effort and idempotent: an account
 * already credited is never changed, a suspended partner earns nothing, and
 * a partner's own account is never credited to them.
 */
export async function attributeSignup(userId: string, cookieValue: string | null | undefined): Promise<void> {
  try {
    const ref = parsePartnerRef(cookieValue);
    if (!ref) return;
    const admin = supabaseAdmin();

    const [{ data: partner }, { data: profile }] = await Promise.all([
      admin.from("partners").select("id, status, user_id").eq("slug", ref.slug).maybeSingle(),
      admin.from("profiles").select("created_at, referred_by_partner").eq("id", userId).maybeSingle(),
    ]);
    if (!partner || partner.status !== "active" || partner.user_id === userId) return;
    if (!profile || profile.referred_by_partner) return;
    // Existing accounts are not attributable: it must have been created after the click.
    if (Date.parse(profile.created_at as string) < ref.clickedAt - 60_000) return;

    await admin
      .from("profiles")
      .update({ referred_by_partner: partner.id, referred_at: new Date().toISOString() })
      .eq("id", userId)
      .is("referred_by_partner", null);
  } catch {
    // Attribution must never break a signup.
  }
}
