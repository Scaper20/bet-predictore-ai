"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Tier } from "@/lib/entitlements";
import { useEntitlement, meetsTier } from "@/components/entitlements/entitlement-provider";

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pass: "Weekend Pass",
  pro: "Pro",
  vip: "VIP",
};

/**
 * Wraps a paid widget. Defaults to locked while the tier is still loading —
 * never unlock-then-lock, which would flash paid content to a free visitor.
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
  const unlocked = !loading && meetsTier(entitlement.tier, requires);

  if (unlocked) return <>{children}</>;
  return fallback !== undefined ? <>{fallback}</> : <UpsellTeaser requires={requires} />;
}

function UpsellTeaser({ requires }: { requires: Tier }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-dashed p-6 text-center">
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
