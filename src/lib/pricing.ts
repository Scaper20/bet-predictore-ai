import type { Tier } from "@/lib/entitlements";

/**
 * Single source of truth for plan copy/pricing — imported by the landing
 * page's Pricing section and the in-app billing page so the two surfaces
 * can't drift out of sync.
 */
export interface PlanDefinition {
  id: Tier;
  name: string;
  description: string;
  features: string[];
  /** Naira. `oneOff` for the Weekend Pass, `monthly`/`yearly` for recurring plans. */
  price: { oneOff?: number; monthly?: number; yearly?: number };
  cadence: string;
  highlighted?: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    description: "Everything you need to stop betting blind.",
    features: [
      "Live scores across every tracked league",
      "Fixtures up to 14 days ahead",
      "Full 1X2, over/under and BTTS probabilities",
      "Model transparency: sample size and data quality",
      "Bet slip builder with true combined odds",
    ],
    price: {},
    cadence: "forever",
  },
  {
    id: "pass",
    name: "Weekend Pass",
    description: "One matchday slate, full analysis. No subscription.",
    features: [
      "Everything in Free",
      "Value detection against your bookmaker's odds",
      "Kelly staking guidance, capped and sane",
      "Correct-score and Asian handicap breakdowns",
      "Quick-Slip bet-code converter",
    ],
    price: { oneOff: 700 },
    cadence: "Fri–Mon access",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For bettors who stake often enough to care about edge.",
    features: [
      "Everything in Weekend Pass, always on",
      "AI match briefings written from the model output",
      "Early access to new markets and leagues",
    ],
    price: { monthly: 3500, yearly: 33600 },
    cadence: "per month",
    highlighted: true,
  },
  {
    id: "vip",
    name: "VIP",
    description: "For serious, high-volume stakers.",
    features: [
      "Everything in Pro",
      "Live in-play win-probability (rolling out)",
      "Value-shift alerts",
      "Priority support",
    ],
    price: { monthly: 12000 },
    cadence: "per month",
  },
];

export function planById(id: Tier): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}
