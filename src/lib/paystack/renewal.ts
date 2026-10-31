import type { BillingCycle } from "@/lib/pricing";

/** Paystack plan intervals we sell, as billing cycles. */
const INTERVAL_CYCLE: Record<string, BillingCycle> = {
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "yearly",
};

const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export function cycleFromInterval(interval: string | undefined): BillingCycle | undefined {
  return interval ? INTERVAL_CYCLE[interval] : undefined;
}

/**
 * The paid-through date after a renewal charge: one cycle on from the end of
 * the period being renewed, or from now when that period has already lapsed
 * (Paystack retried a failed charge late), so a renewal never buys less than
 * a full cycle and never stacks onto a stale date.
 */
export function renewedPeriodEnd(currentEnd: Date | null, now: Date, cycle: BillingCycle): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + CYCLE_MONTHS[cycle]);
  return next;
}
