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
  /** Card bullets. Kept as strings — the comparison grid lives in PLAN_MATRIX. */
  features: string[];
  /** Naira. `oneOff` is the cheapest pass length; recurring plans carry one price per cycle. */
  price: { oneOff?: number; monthly?: number; quarterly?: number; yearly?: number };
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

export type PassLength = "day" | "weekend" | "week";

export interface PassOption {
  id: PassLength;
  label: string;
  price: number;
  /** How long it lasts, in the words shown under the price. */
  window: string;
}

/**
 * The three lengths of the one-off pass, cheapest first.
 *
 * Repriced in October 2026 once the cost of serving a paying user was
 * measured (docs/pricing.md): every
 * paid day includes Ask BetriX and the written breakdowns, both metered AI
 * calls, so ₦250 a day could lose money on one active user. ₦500 is still
 * under a data bundle. The week stays priced so four of them (₦8,000) cost
 * more than a month of Pro (₦5,000), so a regular pass buyer has a reason to
 * subscribe. Expiry rules live in paystack/pass-window.ts.
 */
export const PASS_OPTIONS: PassOption[] = [
  { id: "day", label: "Day", price: 500, window: "24 hours" },
  { id: "weekend", label: "Weekend", price: 1000, window: "Fri–Mon" },
  { id: "week", label: "Week", price: 2000, window: "7 days" },
];

export function passOption(id: string | undefined): PassOption {
  return PASS_OPTIONS.find((o) => o.id === id) ?? PASS_OPTIONS[1];
}

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
    description: "Everything you need to stop guessing.",
    features: [
      "Live scores across every tracked league",
      "Fixtures up to 14 days ahead",
      "Full 1X2, over/under and BTTS probabilities",
      "Model transparency: sample size and data quality",
      "Selection builder with true combined probability",
    ],
    price: {},
    cadence: "forever",
    ctaLabel: "Start free",
    order: 1,
  },
  {
    id: "pass",
    name: "Pass",
    description: "All of Pro for a day, a weekend or a week. No subscription.",
    features: [
      "Everything in Free",
      "Full enhanced match breakdown and key factors",
      "Value detection against the price you're offered",
      "Kelly allocation guidance, capped and sane",
      "Asian handicap breakdowns",
      "Downloadable, shareable slip image",
    ],
    price: { oneOff: PASS_OPTIONS[0].price },
    cadence: "a day",
    ctaLabel: "Get a pass",
    order: 2,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For analysts who track edge across a full slate.",
    features: [
      "Everything in Pass, every day — no repurchasing week to week",
      "Pay monthly, quarterly (save about 10%) or yearly (save 20%)",
    ],
    price: { monthly: 5000, quarterly: 13500, yearly: 48000 },
    cadence: "per month",
    badge: "Most popular",
    ctaLabel: "Go Pro",
    order: 3,
  },
  {
    id: "vip",
    name: "VIP",
    description: "For serious, high-volume analysts.",
    features: [
      "Everything in Pro",
      "Live in-play win-probability, updating as the match unfolds",
      "Value-shift alerts: SportyBet prices that move above fair value, live and by email",
      "Priority support: your messages go to the front of the queue",
    ],
    price: { monthly: 12000, yearly: 115200 },
    cadence: "per month",
    ctaLabel: "Go VIP",
    order: 4,
  },
];

export function planById(id: Tier): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/**
 * Feature-by-feature comparison, kept separate from each plan's `features`.
 *
 * Two shapes because they answer two questions. The card bullets sell a plan
 * on its own terms and are written as sentences; the matrix answers "what do
 * I lose by going down one" and has to be parallel across all four columns.
 * Folding them together would have meant either bullets that read like a
 * spreadsheet or a matrix with gaps in it.
 *
 * A cell is `true`/`false` for a plain tick or dash, or a string when the
 * answer is a quantity rather than a yes.
 */
export interface MatrixRow {
  label: string;
  values: Record<Tier, boolean | string>;
}

export interface MatrixGroup {
  group: string;
  rows: MatrixRow[];
}

export const PLAN_MATRIX: MatrixGroup[] = [
  {
    group: "Coverage",
    rows: [
      {
        label: "Live scores, every tracked competition",
        values: { free: true, pass: true, pro: true, vip: true },
      },
      {
        label: "Fixtures ahead",
        values: { free: "14 days", pass: "14 days", pro: "14 days", vip: "14 days" },
      },
      {
        label: "Settled track record",
        values: { free: true, pass: true, pro: true, vip: true },
      },
    ],
  },
  {
    group: "Markets",
    rows: [
      { label: "Match result (1X2)", values: { free: true, pass: true, pro: true, vip: true } },
      {
        label: "Over/under, both teams to score, double chance",
        values: { free: true, pass: true, pro: true, vip: true },
      },
      { label: "Correct score grid", values: { free: true, pass: true, pro: true, vip: true } },
      { label: "Asian handicap", values: { free: false, pass: true, pro: true, vip: true } },
    ],
  },
  {
    group: "Analysis",
    rows: [
      {
        label: "Sample size and data quality",
        values: { free: true, pass: true, pro: true, vip: true },
      },
      {
        label: "Value against the price you're offered",
        values: { free: false, pass: true, pro: true, vip: true },
      },
      { label: "Staking guidance", values: { free: false, pass: true, pro: true, vip: true } },
      {
        label: "Full enhanced match breakdown",
        values: { free: false, pass: true, pro: true, vip: true },
      },
      {
        label: "Live in-play win probability",
        values: { free: false, pass: false, pro: false, vip: true },
      },
    ],
  },
  {
    group: "Tools",
    rows: [
      { label: "Selection builder", values: { free: true, pass: true, pro: true, vip: true } },
      { label: "Shareable slip image", values: { free: false, pass: true, pro: true, vip: true } },
      {
        label: "Value-shift alerts, live and by email",
        values: { free: false, pass: false, pro: false, vip: true },
      },
      { label: "Priority support", values: { free: false, pass: false, pro: false, vip: true } },
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
