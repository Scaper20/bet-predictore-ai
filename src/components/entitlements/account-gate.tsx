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
    <LockedPreview>
      <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand">
        Free to unlock
      </span>
      <p className="mt-2 font-display text-lg font-bold leading-snug text-ink">{reason}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/account/sign-up?next=${next}`}
          className="glow-brand inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors hover:bg-brand-strong"
        >
          Unlock free <span aria-hidden>→</span>
        </Link>
        <Link
          href={`/account/login?next=${next}`}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Sign in
        </Link>
      </div>
    </LockedPreview>
  );
}

/**
 * A blurred stand-in for what is behind the wall, so the card shows
 * something worth unlocking rather than describing it. Pure decoration:
 * every bar and number is fixed, nothing real is rendered underneath.
 */
export function LockedPreview({ children }: { children: ReactNode }) {
  return (
    <div className="card relative overflow-hidden border-brand/25">
      <div aria-hidden className="pointer-events-none select-none space-y-4 p-5 opacity-50 blur-[3px] sm:p-7">
        {[68, 44, 27].map((w, i) => (
          <div key={w}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-ink-muted">{["Home", "Draw", "Away"][i]}</span>
              <span className="tnum font-bold">{w}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3">
              <div className={`h-full rounded-full ${i === 0 ? "bg-brand" : "bg-ink-dim"}`} style={{ width: `${w}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface/30 via-surface/80 to-surface/95 p-5 text-center">
        <span className="mb-2 grid size-9 place-items-center rounded-full bg-brand/15 text-brand" aria-hidden>
          <svg viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4.5" y="9" width="11" height="8" rx="2" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" strokeLinecap="round" />
          </svg>
        </span>
        {children}
      </div>
    </div>
  );
}
