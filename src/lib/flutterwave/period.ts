import type { BillingCycle } from "@/lib/pricing";

/**
 * Flutterwave payments buy prepaid time, not a subscription: Mobile Money and
 * M-Pesa can't be auto-debited, so nothing renews and nothing needs
 * cancelling. These are the rules for how a payment turns into access.
 */

const MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };
const RANK = { pro: 1, vip: 2 } as const;

/** `from` plus one cycle, by calendar month (31 January + 1 month = 28/29 February). */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + MONTHS[cycle]);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface CurrentPlan {
  tier: string;
  status: string;
  current_period_end: string | null;
}

/** The tier and paid-through date a current row actually gives, or null when it gives nothing. */
function running(current: CurrentPlan | null, now: Date): { tier: "pro" | "vip"; until: Date } | null {
  if (!current || current.status === "none" || !current.current_period_end) return null;
  if (current.tier !== "pro" && current.tier !== "vip") return null;
  const until = new Date(current.current_period_end);
  return until > now ? { tier: current.tier, until } : null;
}

/**
 * Where a new period ends. The same plan bought while it is still running
 * stacks on the end of it, so renewing early never loses days. A higher plan
 * starts now (an upgrade is wanted now). A lower plan is refused while the
 * higher one runs — see canBuy().
 */
export function nextPeriodEnd(current: CurrentPlan | null, tier: "pro" | "vip", cycle: BillingCycle, now: Date): Date {
  const live = running(current, now);
  const base = live && live.tier === tier ? live.until : now;
  return addCycle(base, cycle);
}

/** Whether a Flutterwave purchase of `tier` may start now, and why not when it can't. */
export function canBuy(current: CurrentPlan | null, tier: "pro" | "vip", now: Date): { ok: true } | { ok: false; reason: string } {
  const live = running(current, now);
  if (live && RANK[live.tier] > RANK[tier]) {
    const date = live.until.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return { ok: false, reason: `Your VIP plan runs until ${date}. You can switch to Pro when it ends.` };
  }
  return { ok: true };
}
