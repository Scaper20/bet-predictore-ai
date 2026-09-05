import Link from "next/link";
import type { Tier } from "@/lib/entitlements";
import { PLANS, yearlySaving, type PlanDefinition } from "@/lib/pricing";
import { naira } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";

/**
 * One set of pricing cards, rendered from PLANS.
 *
 * There used to be two of these — a marketing version in landing/sections.tsx
 * and an in-app one in billing/billing-plans.tsx — reading the same PLANS
 * array through different markup that had already drifted on padding, type
 * scale and which fields it bothered to show. Since the whole point of PLANS
 * was that the two surfaces could not disagree, that was the one thing worth
 * fixing here.
 *
 * This is the presentational core and stays a Server Component. The two
 * behaviours that need a client — the interval toggle and the checkout POST —
 * are passed in, so the marketing surface never ships that JavaScript.
 */
export function PricingTable({
  interval = "monthly",
  currentTier,
  hrefFor,
  renderCta,
  plans = PLANS,
}: {
  interval?: "monthly" | "yearly";
  /** Marks "your plan" and suppresses its CTA. Omitted on marketing surfaces. */
  currentTier?: Tier;
  /** Link destination per plan. Ignored when `renderCta` is supplied. */
  hrefFor?: (plan: PlanDefinition) => string;
  /** For surfaces that need a button rather than a link (checkout). */
  renderCta?: (plan: PlanDefinition) => React.ReactNode;
  plans?: PlanDefinition[];
}) {
  const ordered = [...plans].sort((a, b) => a.order - b.order);

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
      {ordered.map((plan) => {
        const current = currentTier === plan.id;
        const saving = yearlySaving(plan);
        const showYearly = interval === "yearly" && plan.price.yearly !== undefined;

        const amount = showYearly
          ? plan.price.yearly
          : (plan.price.oneOff ?? plan.price.monthly);

        return (
          <div
            key={plan.id}
            /*
             * order-first is a mobile-only hierarchy fix, not decoration.
             *
             * Cards render in plan.order: Free, Weekend Pass, Pro, VIP. In a
             * four-column grid all four are equally visible and the "Most
             * popular" badge does the work. Stacked on a phone, ORDER IS
             * HIERARCHY — and Pro, the plan this page exists to sell, sat
             * roughly 950px down, below two screens of scroll. CSS order
             * rather than sorting the array, so the DOM sequence (and so the
             * reading order everywhere else) is untouched.
             */
            className={`card relative flex flex-col p-5 sm:p-7 ${
              plan.badge ? "order-first border-brand/40 glow-brand sm:order-0" : ""
            } ${current ? "border-brand/40" : ""}`}
          >
            {(plan.badge || current) && (
              <Badge tone={current ? "neutral" : "brand"} className="absolute -top-3 left-5 sm:left-7">
                {current ? "Your plan" : plan.badge}
              </Badge>
            )}

            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-ink-muted">{plan.description}</p>

            <div className="mt-4 flex items-baseline gap-2 sm:mt-5">
              <span className="font-display text-3xl font-extrabold sm:text-4xl">
                {amount === undefined ? "Free" : naira(amount)}
              </span>
              <span className="text-sm text-ink-dim">
                {showYearly ? "per year" : plan.cadence}
              </span>
            </div>

            {/* Only shown on the yearly view, where it is the reason to switch. */}
            {showYearly && saving && (
              <p className="mt-1.5 text-xs font-medium text-brand">
                Saves {naira(saving.amount)} a year ({saving.percent}%)
              </p>
            )}

            <ul className="mt-4 flex-1 space-y-2 sm:mt-6 sm:space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-sm text-ink-muted">
                  <span className="mt-0.5 text-brand" aria-hidden>
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 sm:mt-7">
              {current ? (
                <p className="rounded-lg border border-line bg-surface-2 px-5 py-3 text-center text-sm text-ink-muted">
                  Current plan
                </p>
              ) : renderCta ? (
                renderCta(plan)
              ) : (
                <Link
                  href={hrefFor?.(plan) ?? `/account/billing?plan=${plan.id}`}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm transition-colors ${
                    plan.badge
                      ? "bg-brand text-brand-ink hover:bg-brand-strong glow-brand font-semibold"
                      : "bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3"
                  }`}
                >
                  {plan.ctaLabel}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
