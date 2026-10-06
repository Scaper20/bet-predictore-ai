"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Tier } from "@/lib/entitlements";
import { useEntitlement, meetsTier } from "@/components/entitlements/entitlement-provider";
import { GatedPanelSkeleton } from "@/components/match/gated-panel-states";
import { LockedPreview } from "@/components/entitlements/account-gate";

/** The plan a lock sells. "pass" is the lowest paid rank, and is no longer
 * sold, so a lock that a pass would open now sells Pro. */
const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pass: "Pro",
  pro: "Pro",
  vip: "VIP",
};
const TIER_PLAN: Record<Tier, string> = { free: "free", pass: "pro", pro: "pro", vip: "vip" };

/**
 * Wraps a paid widget. Never unlock-then-lock, which would flash paid content
 * to a free visitor.
 *
 * While the tier is still resolving it shows a skeleton rather than the
 * upsell. Locking during load was safe but rude: it meant a subscriber saw
 * "This is a Pro feature — unlock Pro" flash on every match page they opened,
 * having already paid for it. A skeleton is equally closed — no paid content
 * is rendered until the tier is known — and stops the product nagging the
 * people who are already customers.
 */
export function Gate({
  requires,
  children,
  fallback,
}: {
  requires: Tier;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { entitlement, loading } = useEntitlement();

  if (loading) return <GatedPanelSkeleton rows={3} />;
  if (meetsTier(entitlement.tier, requires)) return <>{children}</>;
  return fallback !== undefined ? <>{fallback}</> : <UpsellTeaser requires={requires} />;
}

function UpsellTeaser({ requires }: { requires: Tier }) {
  return (
    <LockedPreview>
      <span className="rounded-full bg-violet/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet">
        {TIER_LABEL[requires]}
      </span>
      <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">Get the full picture</p>
      <Link
        href={`/account/billing?plan=${TIER_PLAN[requires]}`}
        className="glow-brand mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        Unlock {TIER_LABEL[requires]} <span aria-hidden>→</span>
      </Link>
    </LockedPreview>
  );
}
