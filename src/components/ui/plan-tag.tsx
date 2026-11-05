"use client";

import { useEntitlement, meetsTier } from "@/components/entitlements/entitlement-provider";

export type PlanClass = "pro" | "vip";

const TONE: Record<PlanClass, string> = {
  pro: "bg-violet/15 text-violet",
  vip: "bg-amber/15 text-amber",
};

/**
 * The small class tag: PRO or VIP. One look everywhere so members learn it, and
 * it never says more than the class. A free viewer's locked content keeps its
 * lock-style PRO tag (entitlements/locked-pick.tsx); this one marks content a
 * paid plan opens.
 */
export function PlanTag({ plan, className = "" }: { plan: PlanClass; className?: string }) {
  return (
    <span
      title={plan === "vip" ? "VIP" : "Pro"}
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[9px] font-bold uppercase leading-[16px] tracking-[0.12em] ${TONE[plan]} ${className}`}
    >
      {plan}
    </span>
  );
}

/**
 * The viewer's own class on content their plan opens: a Pro member sees PRO, a
 * VIP member VIP. Nothing for a free viewer, who sees the lock instead.
 */
export function ViewerPlanTag({ className = "" }: { className?: string }) {
  const { entitlement } = useEntitlement();
  const plan: PlanClass | null = meetsTier(entitlement.tier, "vip") ? "vip" : meetsTier(entitlement.tier, "pro") ? "pro" : null;
  return plan ? <PlanTag plan={plan} className={className} /> : null;
}
