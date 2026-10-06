"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { naira } from "@/lib/format";
import {
  CYCLE_LABEL, PLANS, cycleSaving, type BillingCycle, type PlanTier,
} from "@/lib/pricing";
import type { Tier } from "@/lib/entitlements";

export function BillingPlans({
  currentTier,
  hasActiveSubscription = false,
  available,
  initialCycle = "monthly",
}: {
  currentTier: Tier;
  hasActiveSubscription?: boolean;
  /**
   * Cycles with a Paystack plan configured, per tier. A cycle whose plan code
   * is missing is not offered at all, rather than offered and then failing at
   * checkout.
   */
  available: Record<"pro" | "vip", BillingCycle[]>;
  initialCycle?: BillingCycle;
}) {
  const cycles = (["monthly", "quarterly", "yearly"] as const).filter(
    (c) => available.pro.includes(c) || available.vip.includes(c),
  );
  const [cycle, setCycle] = useState<BillingCycle>(cycles.includes(initialCycle) ? initialCycle : "monthly");
  const [pending, setPending] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(tier: "pro" | "vip", tierCycle: BillingCycle) {
    setError(null);
    setPending(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, cycle: tierCycle }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed.");
      window.location.assign(body.authorization_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
      setPending(null);
    }
  }

  return (
    <div>
      {cycles.length > 1 && (
        <div className="mb-6 flex justify-center">
          <div className="inline-flex rounded-lg border border-line bg-surface-2 p-1 text-sm" role="radiogroup" aria-label="Billing cycle">
            {cycles.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={`rounded-md px-3.5 py-2 font-medium transition-colors ${
                  cycle === c ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {CYCLE_LABEL[c].name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-center text-sm text-rose">{error}</p>}

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const recurring = plan.id === "pro" || plan.id === "vip";
          const blocked = plan.id !== "free" && hasActiveSubscription && !isCurrent;
          // A tier not sold on the chosen cycle falls back to monthly.
          const tierCycle: BillingCycle = recurring
            ? available[plan.id as "pro" | "vip"].includes(cycle)
              ? cycle
              : "monthly"
            : "monthly";
          const unavailable = recurring && !available[plan.id as "pro" | "vip"].includes(tierCycle);
          const price = recurring ? plan.price[tierCycle] : undefined;
          const saving = recurring ? cycleSaving(plan, tierCycle) : null;

          return (
            <div key={plan.id} className={`card relative flex flex-col p-5 sm:p-7 ${plan.badge ? "border-brand/40 glow-brand" : ""}`}>
              {plan.badge && (
                <Badge tone="brand" className="absolute -top-3 left-6">
                  {plan.badge}
                </Badge>
              )}
              <h3 className="text-base font-semibold">{plan.name}</h3>
              <p className="mt-1 text-xs text-ink-muted">{plan.description}</p>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-extrabold">{!price ? "Free" : naira(price)}</span>
                {price ? (
                  <span className="text-xs text-ink-dim">
                    {CYCLE_LABEL[tierCycle].per}
                  </span>
                ) : null}
              </div>
              {saving && <p className="mt-0.5 text-[11px] text-brand">Saves {naira(saving.amount)} ({saving.percent}%)</p>}

              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-xs text-ink-muted">
                    <span className="text-brand" aria-hidden>✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {plan.id === "free" ? (
                <Button variant="secondary" disabled className="mt-5 w-full">
                  {isCurrent ? "Current plan" : "Included"}
                </Button>
              ) : (
                <Button
                  variant={plan.badge ? "primary" : "secondary"}
                  className="mt-5 w-full"
                  disabled={(isCurrent && recurring) || pending !== null || blocked || unavailable}
                  onClick={() => checkout(plan.id as "pro" | "vip", tierCycle)}
                >
                  {isCurrent && recurring
                    ? "Current plan"
                    : blocked
                      ? "Cancel current plan first"
                      : unavailable
                        ? "Not available yet"
                        : pending === plan.id
                          ? "Redirecting…"
                          : `Get ${plan.name}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
