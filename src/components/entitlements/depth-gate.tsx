"use client";

import type { ReactNode } from "react";
import { AccountGate } from "@/components/entitlements/account-gate";
import { REQUIRE_ACCOUNT_FOR_DEPTH } from "@/lib/gating";

/**
 * The account wall on prediction depth, as one component so the product
 * decision lives in one place rather than being re-derived at each call site.
 *
 * Two things it handles that a bare <AccountGate> would not:
 *
 * - The kill switch. When the wall is off, this compiles away to its children
 *   entirely, so turning it off costs nothing at runtime and leaves no
 *   skeleton flash on a page that isn't gated.
 * - Spacing. The panels it wraps sit in a `space-y-5` column, and collapsing
 *   several siblings into one wrapper would otherwise lose the rhythm between
 *   them, so the unlocked branch re-establishes it.
 *
 * THIS IS A SOFT GATE, ON PURPOSE. The children are Server Components, so
 * React streams their rendered output into the flight payload even while this
 * wrapper is showing a skeleton — the markup is in view-source whether or not
 * anyone is signed in. Verified, not assumed.
 *
 * That is the right trade here and it is why the paid <Gate> is built the
 * other way. Paid panels (asian-handicap-client, analysis-rest-client) fetch
 * their own data after an entitlement check precisely so it never reaches an
 * unentitled client, because there the leak is revenue. Here the content is
 * free — the account is the price, not money — so the only thing a leak costs
 * is a little friction, while keeping the markup in the initial HTML protects
 * the indexed match pages that bring people here in the first place. Standard
 * metered-paywall shape, and the mitigation the SEO risk on this change
 * actually needed.
 *
 * If depth ever becomes genuinely paid, this must be rebuilt on the
 * fetch-after-check pattern instead.
 */
export function DepthGate({ children, reason }: { children: ReactNode; reason: string }) {
  if (!REQUIRE_ACCOUNT_FOR_DEPTH) return <>{children}</>;

  return (
    <AccountGate reason={reason} rows={6}>
      <div className="space-y-5">{children}</div>
    </AccountGate>
  );
}
