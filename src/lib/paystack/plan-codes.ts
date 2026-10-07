import "server-only";

import type { BillingCycle } from "@/lib/pricing";

/**
 * Paystack Plan codes for the recurring tiers — created once in the Paystack
 * dashboard (Settings > Plans), separate codes for test vs live mode. Passes
 * are one-off charges and have no plan code.
 */
const PLAN_ENV: Record<"pro" | "vip", Partial<Record<BillingCycle, string>>> = {
  pro: {
    monthly: "PAYSTACK_PRO_MONTHLY_PLAN_CODE",
    quarterly: "PAYSTACK_PRO_QUARTERLY_PLAN_CODE",
    yearly: "PAYSTACK_PRO_YEARLY_PLAN_CODE",
  },
  vip: {
    monthly: "PAYSTACK_VIP_MONTHLY_PLAN_CODE",
    quarterly: "PAYSTACK_VIP_QUARTERLY_PLAN_CODE",
    yearly: "PAYSTACK_VIP_YEARLY_PLAN_CODE",
  },
};

export function planCodeFor(tier: "pro" | "vip", cycle: BillingCycle): string {
  const key = PLAN_ENV[tier][cycle];
  if (!key) throw new Error(`${tier} is not sold ${cycle}.`);
  const code = process.env[key];
  if (!code) throw new Error(`${key} is not set — create the Plan in the Paystack dashboard first.`);
  return code;
}

/** Which cycles can actually be checked out right now, per tier. */
export function availableCycles(): Record<"pro" | "vip", BillingCycle[]> {
  const out = { pro: [] as BillingCycle[], vip: [] as BillingCycle[] };
  for (const tier of ["pro", "vip"] as const) {
    for (const [cycle, key] of Object.entries(PLAN_ENV[tier]) as [BillingCycle, string][]) {
      if (process.env[key]) out[tier].push(cycle);
    }
  }
  return out;
}

/**
 * The tier a plan code pays for — used to identify renewals, which carry none
 * of our checkout metadata. Includes any retired codes listed in
 * PAYSTACK_LEGACY_PLAN_CODES ("code:tier,code:tier"), so members still on an
 * old plan keep being recognised.
 */
export function tierFromPlanCode(planCode: string | undefined): "pro" | "vip" | undefined {
  if (!planCode) return undefined;
  for (const tier of ["pro", "vip"] as const) {
    for (const key of Object.values(PLAN_ENV[tier])) {
      if (key && process.env[key] === planCode) return tier;
    }
  }
  for (const pair of (process.env.PAYSTACK_LEGACY_PLAN_CODES ?? "").split(",")) {
    const [code, tier] = pair.split(":").map((s) => s.trim());
    if (code === planCode && (tier === "pro" || tier === "vip")) return tier;
  }
  return undefined;
}
