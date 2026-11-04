import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildRenewalsView, type PayRow, type RenewalsView, type SubRow } from "@/lib/renewals-view";

/** Trusts its caller already ran requireAdmin()/requirePermission(), like the rest of lib/admin-*.ts. */
type ProfileJoin = { email: string | null };
const firstOf = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

export async function getRenewalsView(now = new Date()): Promise<RenewalsView> {
  const admin = supabaseAdmin();
  const [subs, pays] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, tier, status, provider, paystack_subscription_code, current_period_end, profiles(email)")
      .in("tier", ["pro", "vip"]),
    admin
      .from("payments")
      .select("user_id, plan, amount_kobo, created_at, paystack_reference")
      .eq("status", "success")
      .eq("provider", "paystack")
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);

  const subRows: SubRow[] = (subs.data ?? []).map((s) => ({
    userId: s.user_id as string,
    email: firstOf(s.profiles as ProfileJoin | ProfileJoin[] | null)?.email ?? null,
    tier: s.tier as string,
    status: s.status as string,
    provider: (s.provider as string | null) ?? null,
    subscriptionCode: (s.paystack_subscription_code as string | null) ?? null,
    periodEnd: (s.current_period_end as string | null) ?? null,
  }));
  const payRows: PayRow[] = (pays.data ?? []).map((p) => ({
    userId: p.user_id as string,
    plan: p.plan as string,
    amountKobo: p.amount_kobo as number,
    createdAt: p.created_at as string,
    reference: p.paystack_reference as string,
  }));
  return buildRenewalsView({ subs: subRows, payments: payRows, now });
}
