"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { naira } from "@/lib/format";
import { PLANS } from "@/lib/pricing";
import type { Tier } from "@/lib/entitlements";

export function BillingPlans({
  currentTier,
  hasActiveSubscription = false,
}: {
  currentTier: Tier;
  hasActiveSubscription?: boolean;
}) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [pending, setPending] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(tier: Exclude<Tier, "free">) {
    setError(null);
    setPending(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, cycle }),
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
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-lg border border-line bg-surface-2 p-1 text-sm">
          {(["monthly", "yearly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${
                cycle === c ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {c === "monthly" ? "Monthly" : "Yearly (save ~20% on Pro)"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-center text-sm text-rose">{error}</p>}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const blocked = (plan.id === "pro" || plan.id === "vip") && hasActiveSubscription && !isCurrent;
          const price =
            plan.id === "pass"
              ? plan.price.oneOff
              : cycle === "yearly"
                ? (plan.price.yearly ?? plan.price.monthly)
                : plan.price.monthly;
          const perMonthYearly = plan.id === "pro" && cycle === "yearly" && plan.price.yearly ? plan.price.yearly / 12 : null;

          return (
            <div key={plan.id} className={`card relative flex flex-col p-7 ${plan.badge ? "border-brand/40 glow-brand" : ""}`}>
              {plan.badge && (
                <Badge tone="brand" className="absolute -top-3 left-6">
                  {plan.badge}
                </Badge>
              )}
              <h3 className="text-base font-semibold">{plan.name}</h3>
              <p className="mt-1 text-xs text-ink-muted">{plan.description}</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-extrabold">{!price ? "Free" : naira(price)}</span>
                {price ? <span className="text-xs text-ink-dim">{plan.id === "pro" ? `/${cycle === "yearly" ? "yr" : "mo"}` : plan.cadence}</span> : null}
              </div>
              {perMonthYearly && <p className="mt-0.5 text-[11px] text-ink-dim">≈ {naira(Math.round(perMonthYearly))}/mo</p>}

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
                  disabled={isCurrent || pending !== null || blocked}
                  onClick={() => checkout(plan.id as Exclude<Tier, "free">)}
                >
                  {isCurrent
                    ? "Current plan"
                    : blocked
                      ? "Cancel current plan first"
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
