import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * How the offers are doing, for /admin/offers: passes sold, buyers, revenue,
 * and how many buyers went on to a real plan within CONVERT_DAYS of their
 * pass starting (any successful payment that isn't another offer). That
 * last number is the one that says whether passes bring in members or just
 * one-off buyers.
 */

export const CONVERT_DAYS = 7;

export interface OfferStat {
  passes: number;
  buyers: number;
  revenueKobo: number;
  /** Buyers with a plan payment within CONVERT_DAYS after their pass started. */
  converted: number;
  /** Buyers whose CONVERT_DAYS haven't run out yet, so may still convert. */
  pending: number;
}

export interface RecentPass {
  email: string | null;
  offerId: string | null;
  tier: string;
  amountKobo: number;
  startsAt: string;
  expiresAt: string;
  converted: boolean;
}

const empty = (): OfferStat => ({ passes: 0, buyers: 0, revenueKobo: 0, converted: 0, pending: 0 });

export async function offerStats(now = Date.now()): Promise<{
  byOffer: Map<string, OfferStat>;
  total: OfferStat;
  last30: OfferStat;
  recent: RecentPass[];
}> {
  const admin = supabaseAdmin();
  const { data: passes } = await admin
    .from("passes")
    .select("user_id, offer_id, tier, amount_kobo, starts_at, expires_at, profiles(email)")
    .order("starts_at", { ascending: false })
    .limit(5000);
  const rows = passes ?? [];
  const users = [...new Set(rows.map((p) => p.user_id as string))];
  const { data: plans } = users.length
    ? await admin.from("payments").select("user_id, created_at").eq("status", "success").not("plan", "like", "offer:%").in("user_id", users)
    : { data: [] as { user_id: string; created_at: string }[] };
  const planTimes = new Map<string, number[]>();
  for (const p of plans ?? []) planTimes.set(p.user_id as string, [...(planTimes.get(p.user_id as string) ?? []), Date.parse(p.created_at as string)]);

  const window = CONVERT_DAYS * 86_400_000;
  const convertedAfter = (userId: string, start: number) => (planTimes.get(userId) ?? []).some((t) => t >= start && t <= start + window);

  const byOffer = new Map<string, OfferStat>();
  const total = empty();
  const last30 = empty();
  // Buyers are counted once per bucket, by their first pass in it.
  const seen = new Map<OfferStat, Set<string>>();
  const add = (s: OfferStat, userId: string, amount: number, start: number) => {
    s.passes += 1;
    s.revenueKobo += amount;
    const set = seen.get(s) ?? new Set<string>();
    seen.set(s, set);
    if (set.has(userId)) return;
    set.add(userId);
    s.buyers += 1;
    if (convertedAfter(userId, start)) s.converted += 1;
    else if (now - start < window) s.pending += 1;
  };

  const recent: RecentPass[] = [];
  for (const p of rows) {
    const userId = p.user_id as string;
    const start = Date.parse(p.starts_at as string);
    const amount = Number(p.amount_kobo ?? 0);
    const key = (p.offer_id as string | null) ?? "none";
    if (!byOffer.has(key)) byOffer.set(key, empty());
    add(byOffer.get(key)!, userId, amount, start);
    add(total, userId, amount, start);
    if (now - start < 30 * 86_400_000) add(last30, userId, amount, start);
    if (recent.length < 25) {
      const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      recent.push({
        email: (profile as { email?: string } | null)?.email ?? null,
        offerId: (p.offer_id as string | null) ?? null,
        tier: p.tier as string,
        amountKobo: amount,
        startsAt: p.starts_at as string,
        expiresAt: p.expires_at as string,
        converted: convertedAfter(userId, start),
      });
    }
  }
  return { byOffer, total, last30, recent };
}
