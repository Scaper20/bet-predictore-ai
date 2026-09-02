"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Tier } from "@/lib/entitlements";
import { useEntitlement, meetsTier } from "@/components/entitlements/entitlement-provider";
import { GatedPanelSkeleton } from "@/components/match/gated-panel-states";

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pass: "Weekend Pass",
  pro: "Pro",
  vip: "VIP",
};

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
    <div className="card flex flex-col items-center gap-3 border-dashed p-7 text-center">
      <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-lg" aria-hidden>
        🔒
      </span>
      <p className="text-sm text-ink-muted">
        This is a <span className="font-semibold text-ink">{TIER_LABEL[requires]}</span> feature.
      </p>
      <Link
        href={`/account/billing?plan=${requires}`}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        Unlock {TIER_LABEL[requires]}
      </Link>
    </div>
  );
}
