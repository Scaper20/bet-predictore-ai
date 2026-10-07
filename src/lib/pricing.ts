import type { Tier } from "@/lib/entitlements";

/**
 * Single source of truth for plan copy/pricing — imported by the landing
 * page's Pricing section and the in-app billing page so the two surfaces
 * can't drift out of sync.
 */
/**
 * The tiers on sale. "pass" stays a Tier so passes bought before it was
 * withdrawn (October 2026) keep working until they expire, but it is no
 * longer sold, priced or compared.
 */
export type PlanTier = Exclude<Tier, "pass">;

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  description: string;
  /** Card bullets. Kept as strings — the comparison grid lives in PLAN_MATRIX. */
  features: string[];
  /** Naira, one price per cycle the plan is sold on. */
  price: { monthly?: number; quarterly?: number; yearly?: number };
  cadence: string;
  /**
   * Ribbon text, replacing a boolean `highlighted`. A boolean could only ever
   * say "Most popular"; a string lets a plan be marked "Best value" or
   * "New" without a second flag and a branch to read it.
   */
  badge?: string;
  /** CTA copy. Previously a loose map in sections.tsx that had to be kept in step. */
  ctaLabel: string;
  order: number;
}

export type BillingCycle = "monthly" | "quarterly" | "yearly";

export const CYCLE_LABEL: Record<BillingCycle, { name: string; per: string }> = {
  monthly: { name: "Monthly", per: "per month" },
  quarterly: { name: "Quarterly", per: "per quarter" },
  yearly: { name: "Yearly", per: "per year" },
};

/** The price of a recurring plan on a cycle, or undefined when it is not sold that way. */
export function cyclePrice(plan: PlanDefinition, cycle: BillingCycle): number | undefined {
  return plan.price[cycle];
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    description: "Every match, the 1X2 read and 6 free picks a day.",
    features: [
      "Every match, live scores and fixtures 14 days ahead",
      "Match result (1X2) probabilities and 1X2 picks",
      "6 free picks a day: a Strong pick, 2 hot games and 3 more",
      "Forge: 5 slips a day, 1X2 only",
      "Ask BetriX: 3 questions a day",
      "For You feed with likes and comments",
    ],
    price: {},
    cadence: "forever",
    ctaLabel: "Start free",
    order: 1,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Every market and every pick, on every match.",
    features: [
      "Everything in Free",
      "Every market: over/under, GG/NG, double chance, correct score, Asian handicap",
      "Every pick and every Strong pick",
      "Strong pick alerts at kick-off and full time",
      "Forge with every market, 100 slips a day",
      "Ask BetriX: 30 questions a day",
      "Full match breakdown, value against your price and staking guidance",
      "Pay monthly, quarterly (save 10%) or yearly (save 20%)",
    ],
    price: { monthly: 5000, quarterly: 13500, yearly: 48000 },
    cadence: "per month",
    badge: "Most popular",
    ctaLabel: "Go Pro",
    order: 2,
  },
  {
    id: "vip",
    name: "VIP",
    description: "Live edges, alerts and priority help.",
    features: [
      "Everything in Pro",
      "Live in-play win probability, updating as the match unfolds",
      "Value-shift alerts: SportyBet prices that move above fair value, live and by email",
      "Ask BetriX: 100 questions a day",
      "Priority support: your messages go to the front of the queue",
    ],
    price: { monthly: 12000, yearly: 115200 },
    cadence: "per month",
    ctaLabel: "Go VIP",
    order: 3,
  },
];

export function planById(id: PlanTier): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/**
 * Feature-by-feature comparison, kept separate from each plan's `features`.
 *
 * Two shapes because they answer two questions. The card bullets sell a plan
 * on its own terms and are written as sentences; the matrix answers "what do
 * I lose by going down one" and has to be parallel across all three columns.
 * Folding them together would have meant either bullets that read like a
 * spreadsheet or a matrix with gaps in it.
 *
 * A cell is `true`/`false` for a plain tick or dash, or a string when the
 * answer is a quantity rather than a yes.
 */
export interface MatrixRow {
  label: string;
  values: Record<PlanTier, boolean | string>;
}

export interface MatrixGroup {
  group: string;
  rows: MatrixRow[];
}

export const PLAN_MATRIX: MatrixGroup[] = [
  {
    group: "Matches",
    rows: [
      { label: "Every match, live scores", values: { free: true, pro: true, vip: true } },
      { label: "Fixtures ahead", values: { free: "14 days", pro: "14 days", vip: "14 days" } },
      { label: "Settled track record", values: { free: true, pro: true, vip: true } },
      { label: "For You feed, likes and comments", values: { free: true, pro: true, vip: true } },
    ],
  },
  {
    group: "Picks and markets",
    rows: [
      { label: "Match result (1X2) and 1X2 picks", values: { free: true, pro: true, vip: true } },
      { label: "Strong picks", values: { free: "1 a day", pro: "All", vip: "All" } },
      {
        label: "Over/under, GG/NG, double chance, correct score",
        values: { free: false, pro: true, vip: true },
      },
      { label: "Picks in every market", values: { free: "6 a day", pro: true, vip: true } },
      { label: "Asian handicap", values: { free: false, pro: true, vip: true } },
      { label: "Half-time and second-half markets", values: { free: false, pro: true, vip: true } },
    ],
  },
  {
    group: "Tools",
    rows: [
      { label: "Forge slip builder", values: { free: "5 a day, 1X2", pro: "100 a day", vip: "100 a day" } },
      { label: "Ask BetriX", values: { free: "3 a day", pro: "30 a day", vip: "100 a day" } },
      { label: "Selection builder and slip tracking", values: { free: true, pro: true, vip: true } },
      { label: "Shareable slip image", values: { free: false, pro: true, vip: true } },
    ],
  },
  {
    group: "Analysis",
    rows: [
      { label: "Full match breakdown and key factors", values: { free: false, pro: true, vip: true } },
      { label: "Value against the price you're offered", values: { free: false, pro: true, vip: true } },
      { label: "Staking guidance", values: { free: false, pro: true, vip: true } },
      { label: "Live in-play win probability", values: { free: false, pro: false, vip: true } },
    ],
  },
  {
    group: "Alerts and support",
    rows: [
      { label: "Morning picks notification", values: { free: true, pro: true, vip: true } },
      { label: "Strong pick alerts, kick-off and result", values: { free: "Free pick", pro: true, vip: true } },
      { label: "Value-shift alerts, live and by email", values: { free: false, pro: false, vip: true } },
      { label: "Priority support", values: { free: false, pro: false, vip: true } },
    ],
  },
];

/**
 * What paying yearly actually saves, in naira and percent.
 *
 * Worth computing rather than hardcoding "save 20%" in copy: the two numbers
 * would drift apart the first time a price changes, and the one that would
 * quietly stay wrong is the one customers read.
 */
export function yearlySaving(plan: PlanDefinition): { amount: number; percent: number } | null {
  return cycleSaving(plan, "yearly");
}

/** What a longer cycle saves against paying monthly for the same period. */
export function cycleSaving(
  plan: PlanDefinition,
  cycle: BillingCycle,
): { amount: number; percent: number } | null {
  const { monthly } = plan.price;
  const price = plan.price[cycle];
  if (!monthly || !price || cycle === "monthly") return null;

  const fullPrice = monthly * (cycle === "yearly" ? 12 : 3);
  const amount = fullPrice - price;
  if (amount <= 0) return null;

  return { amount, percent: Math.round((amount / fullPrice) * 100) };
}
