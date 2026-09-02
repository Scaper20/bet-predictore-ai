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
  /** Naira. `oneOff` for the Weekend Pass, `monthly`/`yearly` for recurring plans. */
  price: { oneOff?: number; monthly?: number; yearly?: number };
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
    name: "Weekend Pass",
    description: "One matchday slate, full analysis. No subscription.",
    features: [
      "Everything in Free",
      "Value detection against the price you're offered",
      "Kelly allocation guidance, capped and sane",
      "Asian handicap breakdowns",
      "Downloadable, shareable slip image",
    ],
    price: { oneOff: 700 },
    cadence: "Fri–Mon access",
    ctaLabel: "Get this weekend",
    order: 2,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For analysts who track edge across a full slate.",
    features: [
      "Everything in Weekend Pass, every matchday — no repurchasing week to week",
      "Full enhanced match breakdown, not just the opening paragraph",
      "The model's key factors spelled out for every fixture",
    ],
    price: { monthly: 3500, yearly: 33600 },
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
      "Value-shift alerts (coming soon)",
      "Priority support (coming soon)",
    ],
    price: { monthly: 12000 },
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
        values: { free: false, pass: false, pro: true, vip: true },
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
  const { monthly, yearly } = plan.price;
  if (!monthly || !yearly) return null;

  const fullPrice = monthly * 12;
  const amount = fullPrice - yearly;
  if (amount <= 0) return null;

  return { amount, percent: Math.round((amount / fullPrice) * 100) };
}
