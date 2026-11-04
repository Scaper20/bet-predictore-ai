import type { BillingCycle } from "@/lib/pricing";
import { cycleFromInterval } from "@/lib/paystack/renewal";

/**
 * What a Paystack `charge.success` is, decided from facts we hold rather than
 * from what the charge happens to carry (CTO review, 4 Nov 2026, item 1.5).
 *
 * Our own checkout writes a `payments` row under the reference before the
 * customer pays. So a reference we have never seen is a charge Paystack made
 * by itself: a renewal. The old rule was "renewals carry no metadata of ours",
 * which Paystack never promised. A renewal that did carry it was handled as a
 * first charge and the paid-through date never moved.
 */
export type ChargeKind = "once" | "offer" | "first" | "renewal";

export function chargeKind(i: { onceFlag: boolean; offerFlag: boolean; knownReference: boolean }): ChargeKind {
  if (i.onceFlag) return "once";
  if (i.offerFlag) return "offer";
  return i.knownReference ? "first" : "renewal";
}

/** The billing cycle named by one of our plan labels: "vip:monthly" or "vip:monthly:once". */
export function cycleFromPlanLabel(plan: string | null | undefined): BillingCycle | undefined {
  const cycle = plan?.split(":")[1];
  return cycle === "monthly" || cycle === "quarterly" || cycle === "yearly" ? cycle : undefined;
}

export interface CycleResolution {
  cycle?: BillingCycle;
  source: "interval" | "plan-code" | "last-payment" | "none";
}

/**
 * The cycle a renewal pays for, from the most direct evidence down: the plan
 * interval on the charge, then which of our configured Paystack plan codes it
 * is, then what this member paid last. Never a guess: with none of them it is
 * "none", and the caller reports it instead of moving the date.
 */
export function resolveCycle(i: { interval?: string; codeCycle?: BillingCycle; lastPlanLabel?: string | null }): CycleResolution {
  const fromInterval = cycleFromInterval(i.interval);
  if (fromInterval) return { cycle: fromInterval, source: "interval" };
  if (i.codeCycle) return { cycle: i.codeCycle, source: "plan-code" };
  const fromLast = cycleFromPlanLabel(i.lastPlanLabel);
  if (fromLast) return { cycle: fromLast, source: "last-payment" };
  return { source: "none" };
}
