"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { formatMoney, NIGERIA, type Market } from "@/lib/payments/markets";
import {
  CYCLE_LABEL, PLANS, priceSaving, type BillingCycle, type PlanTier,
} from "@/lib/pricing";
import type { Tier } from "@/lib/entitlements";

const ALL_CYCLES: BillingCycle[] = ["monthly", "quarterly", "yearly"];
const SPAN: Record<BillingCycle, string> = { monthly: "one month", quarterly: "3 months", yearly: "a year" };

export function BillingPlans({
  currentTier,
  hasActiveSubscription = false,
  available,
  initialCycle = "monthly",
  market = NIGERIA,
  prepaid = null,
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
  /** Where the payer is: Paystack in naira, or Flutterwave in a local currency. */
  market?: Market;
  /** A running Flutterwave (prepaid) plan, which more payments add time to. */
  prepaid?: { tier: "pro" | "vip"; until: string } | null;
}) {
  const flutterwave = market.provider === "flutterwave";
  // Every cycle is sold as a prepaid period (Flutterwave abroad, pay once
  // through Paystack in Nigeria). Card auto-renew in Nigeria is offered only
  // on the cycles with a Paystack plan code configured (`available`).
  const sold = { pro: ALL_CYCLES, vip: ALL_CYCLES };
  const cycles = ALL_CYCLES.filter((c) => sold.pro.includes(c) || sold.vip.includes(c));
  const untilText = prepaid
    ? new Date(prepaid.until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const [cycle, setCycle] = useState<BillingCycle>(cycles.includes(initialCycle) ? initialCycle : "monthly");
  const [pending, setPending] = useState<PlanTier | `${PlanTier}:renew` | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * What a paid plan's button says when the current plan decides it. A
   * Paystack subscription is the "Current plan". A prepaid period takes more
   * time on the same plan or an upgrade, refuses a downgrade until it ends
   * (as the Flutterwave checkout does), and blocks a Paystack subscription,
   * which would replace it.
   */
  function paidButton(tier: "pro" | "vip"): { label?: string; disabled: boolean } {
    if (!prepaid) {
      return tier === currentTier ? { label: "Current plan", disabled: true } : { disabled: false };
    }
    if (tier === prepaid.tier) return { label: pending === tier ? "Redirecting…" : "Add more time", disabled: false };
    if (prepaid.tier === "vip") return { label: `VIP runs until ${untilText}`, disabled: true };
    return { disabled: false };
  }

  /**
   * `renew`: a Paystack card subscription. Otherwise a prepaid period, paid
   * once with any method: Flutterwave abroad, Paystack without a plan in
   * Nigeria (a plan checkout can only take a card).
   */
  async function checkout(tier: "pro" | "vip", tierCycle: BillingCycle, renew = false) {
    setError(null);
    setPending(renew ? `${tier}:renew` : tier);
    try {
      const res = await fetch(flutterwave ? "/api/billing/flutterwave/checkout" : "/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, cycle: tierCycle, country: market.country, once: !flutterwave && !renew }),
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
            ? sold[plan.id as "pro" | "vip"].includes(cycle)
              ? cycle
              : "monthly"
            : "monthly";
          const prices = recurring
            ? flutterwave
              ? (market.prices?.[plan.id as "pro" | "vip"] ?? {})
              : plan.price
            : {};
          // Card auto-renew: Nigeria only, on a cycle with a plan code, and
          // not over a running prepaid period (it would replace it).
          const renewable =
            recurring && !flutterwave && !prepaid && available[plan.id as "pro" | "vip"].includes(tierCycle);
          const price = prices[tierCycle];
          const unavailable = recurring && (!sold[plan.id as "pro" | "vip"].includes(tierCycle) || !price);
          const saving = recurring ? priceSaving(prices, tierCycle) : null;
          const money = (n: number) => formatMoney(n, market.currency);
          const button = paidButton(plan.id as "pro" | "vip");

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
                <span className="font-mono tracking-tight text-xl font-medium">{!price ? "Free" : money(price)}</span>
                {price ? (
                  <span className="text-xs text-ink-dim">
                    {CYCLE_LABEL[tierCycle].per}
                  </span>
                ) : null}
              </div>
              {saving && <p className="mt-0.5 text-[11px] text-brand">Saves {money(saving.amount)} ({saving.percent}%)</p>}

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
                  disabled={button.disabled || pending !== null || blocked || unavailable}
                  onClick={() => checkout(plan.id as "pro" | "vip", tierCycle)}
                >
                  {button.label ??
                    (blocked
                      ? "Cancel current plan first"
                      : unavailable
                        ? "Not available yet"
                        : pending === plan.id
                          ? "Redirecting…"
                          : `Get ${plan.name}`)}
                </Button>
              )}
              {plan.id !== "free" && !flutterwave && !button.disabled && !blocked && !unavailable && (
                <p className="mt-2 text-center text-[11px] leading-snug text-ink-dim">
                  Bank transfer, OPay, PalmPay, USSD or card. Pays for {SPAN[tierCycle]}, no auto-renew.
                  {renewable && (
                    <>
                      {" "}
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() => checkout(plan.id as "pro" | "vip", tierCycle, true)}
                        className="font-semibold text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
                      >
                        {pending === `${plan.id}:renew` ? "Redirecting…" : "Auto-renew with a card instead"}
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-ink-dim">
        Refunds: 7 days on a first payment, 48 hours on a renewal.{" "}
        <Link href="/refunds" className="underline underline-offset-2 hover:text-ink">
          Refund policy
        </Link>
      </p>
    </div>
  );
}
