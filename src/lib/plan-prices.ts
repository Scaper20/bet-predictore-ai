import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { cached } from "@/lib/providers/cache";
import { PLANS, type BillingCycle, type PlanDefinition } from "@/lib/pricing";

/**
 * Nigeria's naira plan prices, as set in /admin/offers (table plan_prices,
 * 0087) over the defaults in lib/pricing.ts. Pay-once checkouts charge these
 * and every price shown reads them. A card subscription is charged what its
 * Paystack plan says, so the editor shows that amount beside each price and
 * flags a difference (the Paystack plan has to be changed too).
 *
 * Held for a minute per server; prices outside Nigeria (lib/payments/
 * markets.ts) are unchanged by this.
 */

export type PriceOverrides = Partial<Record<"pro" | "vip", Partial<Record<BillingCycle, number>>>>;

export async function priceOverrides(): Promise<PriceOverrides> {
  return cached("plan-prices", 60_000, async () => {
    const { data, error } = await supabaseAdmin().from("plan_prices").select("tier, cycle, naira");
    if (error) throw error;
    const out: PriceOverrides = {};
    for (const r of data ?? []) {
      const tier = r.tier as "pro" | "vip";
      (out[tier] ??= {})[r.cycle as BillingCycle] = Number(r.naira);
    }
    return out;
  }).catch(() => ({}));
}

export function withOverrides(plans: PlanDefinition[], o: PriceOverrides): PlanDefinition[] {
  return plans.map((p) => (p.id === "pro" || p.id === "vip") && o[p.id] ? { ...p, price: { ...p.price, ...o[p.id] } } : p);
}

/** PLANS with the admin's prices applied. */
export async function getPlans(): Promise<PlanDefinition[]> {
  return withOverrides(PLANS, await priceOverrides());
}

export async function getPlan(id: PlanDefinition["id"]): Promise<PlanDefinition> {
  const plan = (await getPlans()).find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}
