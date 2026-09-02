"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { GatedPanelSkeleton } from "@/components/match/gated-panel-states";

/**
 * Wraps content that needs an account but not a payment.
 *
 * Deliberately the opposite of <Gate> on the loading branch. Gate fails closed
 * because it protects paid content and flashing that to a free visitor leaks
 * revenue. Here there is nothing to leak — the content is free, it just needs
 * a registration — and the costly mistake runs the other way: showing a
 * sign-up wall to someone already signed in reads as broken and is the single
 * most annoying thing this feature could do. So it holds a skeleton until the
 * tier resolves, then decides.
 */
export function AccountGate({
  children,
  reason,
  rows,
}: {
  children: ReactNode;
  /** What signing up unlocks, in the user's terms. Shown on the wall. */
  reason: string;
  rows?: number;
}) {
  const { entitlement, loading } = useEntitlement();

  if (loading) return <GatedPanelSkeleton rows={rows} />;
  if (entitlement.signedIn) return <>{children}</>;
  return <SignUpWall reason={reason} />;
}

/**
 * The wall itself. Distinct from gate.tsx's UpsellTeaser on purpose: that one
 * sells a plan, this one asks for an email address, and blurring them would
 * make a free account look like a purchase.
 */
export function SignUpWall({ reason }: { reason: string }) {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname);

  return (
    <div className="card flex flex-col items-center gap-3 border-dashed p-7 text-center">
      <span
        className="grid size-9 place-items-center rounded-full bg-brand/12 text-lg text-brand"
        aria-hidden
      >
        ✦
      </span>
      <p className="text-sm font-semibold">{reason}</p>
      <p className="max-w-sm text-xs text-ink-muted">
        Free account, no card. It also saves your leagues and keeps your selections in sync
        across devices.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/account/sign-up?next=${next}`}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
        >
          Create free account
        </Link>
        <Link
          href={`/account/login?next=${next}`}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
