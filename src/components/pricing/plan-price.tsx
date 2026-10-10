"use client";

import { CYCLE_LABEL, priceSaving, type BillingCycle, type PlanDefinition } from "@/lib/pricing";
import { formatMoney, marketFor, NIGERIA } from "@/lib/payments/markets";
import { useCountry } from "@/lib/use-visitor";

/**
 * A plan's price in the visitor's own currency (lib/payments/markets.ts).
 *
 * A client component so cached pages can show it: the server renders
 * Nigeria's naira price and the browser swaps in the visitor's market once it
 * hydrates (lib/use-visitor.ts). A page that already knows the country (it
 * reads the request) passes `country` and renders the right price at once.
 * `sellsAbroad` is false until Flutterwave is configured, and then everyone
 * sees naira, which is what they would pay.
 */
export function PlanPrice({
  plan,
  cycle,
  sellsAbroad,
  country,
}: {
  plan: Pick<PlanDefinition, "id" | "price" | "cadence">;
  cycle: BillingCycle;
  sellsAbroad: boolean;
  country?: string;
}) {
  const visitor = useCountry();
  const market = sellsAbroad ? marketFor(country ?? visitor) : NIGERIA;
  const recurring = plan.price.monthly !== undefined;
  const prices = !recurring
    ? {}
    : market.provider === "flutterwave" && (plan.id === "pro" || plan.id === "vip")
      ? (market.prices?.[plan.id] ?? {})
      : plan.price;
  const amount = prices[cycle];
  const saving = recurring ? priceSaving(prices, cycle) : null;
  const money = (n: number) => formatMoney(n, market.currency);

  return (
    <>
      <div className="mt-4 flex items-baseline gap-2 sm:mt-5">
        <span className="font-display text-3xl font-extrabold sm:text-4xl">
          {amount === undefined ? "Free" : money(amount)}
        </span>
        <span className="text-sm text-ink-dim">{recurring ? CYCLE_LABEL[cycle].per : plan.cadence}</span>
      </div>

      {/* Only on a longer cycle, where it is the reason to switch. */}
      {saving && (
        <p className="mt-1.5 text-xs font-medium text-brand">
          Saves {money(saving.amount)} ({saving.percent}%) against paying monthly
        </p>
      )}
    </>
  );
}
