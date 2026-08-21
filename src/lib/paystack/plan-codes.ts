import "server-only";

/**
 * Paystack Plan codes for the two recurring tiers — created once in the
 * Paystack dashboard (Settings > Plans), separate codes for test vs live
 * mode. The Weekend Pass is a one-off charge and has no plan code.
 */
export function planCodeFor(tier: "pro" | "vip", cycle: "monthly" | "yearly"): string {
  const key =
    tier === "vip"
      ? "PAYSTACK_VIP_MONTHLY_PLAN_CODE"
      : cycle === "yearly"
        ? "PAYSTACK_PRO_YEARLY_PLAN_CODE"
        : "PAYSTACK_PRO_MONTHLY_PLAN_CODE";

  const code = process.env[key];
  if (!code) throw new Error(`${key} is not set — create the Plan in the Paystack dashboard first.`);
  return code;
}
