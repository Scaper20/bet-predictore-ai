import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildCommission } from "@/lib/partners";
import { earnsAfterTermination } from "@/lib/partner-terms";

export interface PaymentForCommission {
  userId: string;
  /** The processor's reference for this payment. Unique per payment, so a replayed webhook cannot pay twice. */
  reference: string;
  provider: "paystack" | "flutterwave";
  plan?: string | null;
  currency: string;
  grossMinor: number;
  /** The fee the processor reported charging, when it did; otherwise an estimate is used. */
  feeMinor?: number | null;
  paidAt?: Date;
}

/**
 * Credits the partner who brought this user, if any, with their share of a
 * successful payment. Called from every place a payment is confirmed
 * (Paystack webhook, Paystack pay-once, Flutterwave). Idempotent on the
 * payment reference, and never throws: a commission problem must not fail
 * the payment that has already been taken and granted.
 */
export async function recordCommission(p: PaymentForCommission): Promise<void> {
  try {
    if (!(p.grossMinor > 0)) return;
    const admin = supabaseAdmin();

    const { data: profile } = await admin.from("profiles").select("referred_by_partner, referred_rate_bps").eq("id", p.userId).maybeSingle();
    const partnerId = profile?.referred_by_partner as string | null | undefined;
    if (!partnerId) return;

    const { data: partner } = await admin.from("partners").select("id, rate_bps, terminated_at").eq("id", partnerId).maybeSingle();
    if (!partner) return;

    // A forfeited referral earns nothing (agreement clause 11.3, termination for breach or fraud).
    const { data: forfeited } = await admin.from("partner_forfeitures").select("user_id").eq("partner_id", partnerId).eq("user_id", p.userId).maybeSingle();
    if (forfeited) return;

    const paidAt = p.paidAt ?? new Date();

    // The 12 months run from the user's first successful payment.
    const [{ data: first }, { data: payment }] = await Promise.all([
      admin
        .from("payments")
        .select("created_at")
        .eq("user_id", p.userId)
        .eq("status", "success")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      p.plan ? Promise.resolve({ data: null }) : admin.from("payments").select("plan").eq("paystack_reference", p.reference).maybeSingle(),
    ]);
    const firstPaidAt = first?.created_at ? new Date(Math.min(Date.parse(first.created_at as string), paidAt.getTime())) : paidAt;

    // After termination only a customer who had already paid keeps earning (clause 11.3).
    const terminatedAt = partner.terminated_at ? new Date(partner.terminated_at as string) : null;
    if (!earnsAfterTermination({ terminatedAt, firstPaidAt, paidAt })) return;

    // The rate in force when the customer was attributed (clause 4.6); a partner's later rate applies to later customers.
    const rateBps = (profile?.referred_rate_bps as number | null | undefined) ?? (partner.rate_bps as number);
    const result = buildCommission({
      partner: { id: partner.id as string, rateBps },
      userId: p.userId,
      payment: {
        reference: p.reference,
        provider: p.provider,
        plan: p.plan ?? (payment?.plan as string | null | undefined) ?? null,
        currency: p.currency,
        grossMinor: p.grossMinor,
        feeMinor: p.feeMinor,
        status: "success",
        paidAt,
      },
      firstPaidAt,
    });
    if (!result.ok) return;

    // payment_reference is unique: the second delivery of the same payment inserts nothing.
    await admin.from("partner_commissions").upsert(result.row, { onConflict: "payment_reference", ignoreDuplicates: true });
  } catch (err) {
    console.error("recordCommission failed", p.reference, err);
  }
}
