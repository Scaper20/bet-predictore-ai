import "server-only";

import { fetchPlan } from "@/lib/paystack/client";
import { nairaToKobo } from "@/lib/paystack/money";
import { planCodeOrNull } from "@/lib/paystack/plan-codes";
import { cyclePrice, type BillingCycle, type PlanDefinition } from "@/lib/pricing";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];

/**
 * A card subscription is charged the amount on its Paystack Plan, not the
 * price on the site. When the two differ (October 2026: Pro 3 months was
 * ₦9,500 on Paystack against ₦13,500 here, VIP yearly ₦76,800 against
 * ₦115,200), the auto-renew option is withheld; paying once still works and
 * is charged the site's price.
 */
export function planMatchesPrice(planAmountKobo: number | null | undefined, priceNaira: number | undefined): boolean {
  return !!priceNaira && planAmountKobo === nairaToKobo(priceNaira);
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; amount: number | null }>();

/** The kobo a plan code charges, cached for ten minutes per server instance; null when Paystack can't be read. */
async function planAmount(code: string): Promise<number | null> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.amount;
  const amount = await fetchPlan(code)
    .then((p) => p.amount)
    .catch(() => null);
  cache.set(code, { at: Date.now(), amount });
  return amount;
}

/** Whether a card subscription on this tier and cycle would be charged the site's price. Fails closed. */
export async function renewalMatches(plan: PlanDefinition, cycle: BillingCycle): Promise<boolean> {
  if (plan.id !== "pro" && plan.id !== "vip") return false;
  const code = planCodeOrNull(plan.id, cycle);
  if (!code) return false;
  return planMatchesPrice(await planAmount(code), cyclePrice(plan, cycle));
}

/** The cycles that can auto-renew from a card at the site's price, per tier. */
export async function renewableCycles(plans: PlanDefinition[]): Promise<Record<"pro" | "vip", BillingCycle[]>> {
  const out = { pro: [] as BillingCycle[], vip: [] as BillingCycle[] };
  await Promise.all(
    plans.flatMap((plan) =>
      plan.id === "pro" || plan.id === "vip"
        ? CYCLES.map(async (cycle) => {
            if (await renewalMatches(plan, cycle)) out[plan.id as "pro" | "vip"].push(cycle);
          })
        : [],
    ),
  );
  for (const tier of ["pro", "vip"] as const) out[tier].sort((a, b) => CYCLES.indexOf(a) - CYCLES.indexOf(b));
  return out;
}
