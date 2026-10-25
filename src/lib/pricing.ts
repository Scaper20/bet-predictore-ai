import type { Tier } from "@/lib/entitlements";
import { weeklyCodeAllowance } from "@/lib/code-hub-plans";

const PRO_CODES = weeklyCodeAllowance("pro");
const VIP_CODES = weeklyCodeAllowance("vip");

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
  quarterly: { name: "3 months", per: "for 3 months" },
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
    description: "Every match, and every pick in 27 competitions, free.",
    features: [
      "Every match, live scores and fixtures 14 days ahead",
      "Every pick and every prediction type in 27 competitions",
      "Pro leagues: the win/draw/loss split, and the pick at kick-off",
      "Today's featured picks, Pro leagues included",
      "Forge: 5 combos a day, match result and two results",
      "Code Hub: the daily 2-odds combo with its SportyBet code",
      "Check any SportyBet code, make it safer, and post yours to the Code Hub",
      "Ask KiqStat: 3 questions a day",
    ],
    price: {},
    cadence: "forever",
    ctaLabel: "Start free",
    order: 1,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pro-league picks before kick-off, the full breakdown, the extra predictions and the tools.",
    features: [
      "Everything in Free",
      "Picks before kick-off in the 15 Pro leagues: Champions League, Serie A, Bundesliga and more",
      "Corners, cards and shots predictions, plus both teams 2+ goals, goal ranges and more",
      "Strong pick alerts at kick-off and full time",
      "Winning margin lines",
      "Half-time predictions and half-by-half goals",
      "Forge with every prediction type, 100 combos a day",
      "Code Hub: every daily combo from 2 to 20 odds before kick-off, each with a SportyBet code",
      `${PRO_CODES} SportyBet codes a week from your own slip, Forge combos or the code editor`,
      "Ask KiqStat: 30 questions a day",
      "Full match breakdown and value against the market price",
      "Pay monthly, every 3 months (save 10%) or yearly (save 20%)",
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
    description: "Daily Strong picks and 2 to 10 combos in the VIP WhatsApp chat, live win probability and priority help.",
    features: [
      "Everything in Pro",
      "The VIP chat on WhatsApp: the day's Strong picks and combos priced 2 to 10, every day before kick-off",
      "Live calls in the big games, and your questions answered first",
      "Live in-play win probability, updating as the match unfolds",
      `${VIP_CODES} SportyBet codes a week from your own picks`,
      "Ask KiqStat: 100 questions a day",
      "Priority support: your messages go to the front of the queue",
      "Pay monthly, every 3 months (save 10%) or yearly (save 20%)",
    ],
    price: { monthly: 12000, quarterly: 32400, yearly: 115200 },
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
    ],
  },
  {
    group: "Picks and predictions",
    rows: [
      { label: "Every pick in the 27 free competitions", values: { free: true, pro: true, vip: true } },
      { label: "Picks before kick-off in the 15 Pro leagues", values: { free: "At kick-off", pro: true, vip: true } },
      { label: "Match result", values: { free: true, pro: true, vip: true } },
      {
        label: "Over/under, both teams to score, two results, correct score",
        values: { free: true, pro: true, vip: true },
      },
      { label: "Corners, cards, shots and shots on target", values: { free: false, pro: true, vip: true } },
      { label: "Both teams 2+ goals, goal ranges, win to nil, result combos", values: { free: false, pro: true, vip: true } },
      { label: "Winning margin", values: { free: false, pro: true, vip: true } },
      { label: "Half-time and half-by-half predictions", values: { free: false, pro: true, vip: true } },
    ],
  },
  {
    group: "Tools",
    rows: [
      { label: "Forge combo builder", values: { free: "5 a day, match result + two results", pro: "100 a day", vip: "100 a day" } },
      { label: "Ask KiqStat", values: { free: "3 a day", pro: "30 a day", vip: "100 a day" } },
      { label: "Selection builder and combo tracking", values: { free: true, pro: true, vip: true } },
      { label: "Shareable combo image", values: { free: false, pro: true, vip: true } },
    ],
  },
  {
    group: "Code Hub and SportyBet",
    rows: [
      { label: "Daily combos from 2 to 20 odds", values: { free: "The 2-odds one", pro: true, vip: true } },
      { label: "SportyBet code on every daily combo", values: { free: "The 2-odds one", pro: true, vip: true } },
      { label: "Check any SportyBet code", values: { free: true, pro: true, vip: true } },
      { label: "Post your codes, ranked by the model", values: { free: true, pro: true, vip: true } },
      {
        label: "SportyBet codes for your own picks or edits",
        values: { free: false, pro: `${PRO_CODES} a week`, vip: `${VIP_CODES} a week` },
      },
    ],
  },
  {
    group: "Analysis",
    rows: [
      { label: "Full match breakdown and key factors", values: { free: false, pro: true, vip: true } },
      { label: "Value against the market price", values: { free: false, pro: true, vip: true } },
      { label: "Live in-play win probability", values: { free: false, pro: false, vip: true } },
    ],
  },
  {
    group: "Alerts, chat and support",
    rows: [
      { label: "Morning picks notification", values: { free: true, pro: true, vip: true } },
      { label: "WhatsApp", values: { free: "Free community", pro: "Free community", vip: "VIP chat" } },
      { label: "Strong pick alerts, kick-off and result", values: { free: false, pro: true, vip: true } },
      { label: "Priority support", values: { free: false, pro: false, vip: true } },
    ],
  },
];

/** What a longer cycle saves against paying monthly for the same period. */
export function cycleSaving(
  plan: PlanDefinition,
  cycle: BillingCycle,
): { amount: number; percent: number } | null {
  return priceSaving(plan.price, cycle);
}

/** cycleSaving for any set of cycle prices, such as a market's local ones (lib/payments/markets.ts). */
export function priceSaving(
  prices: Partial<Record<BillingCycle, number>>,
  cycle: BillingCycle,
): { amount: number; percent: number } | null {
  const { monthly } = prices;
  const price = prices[cycle];
  if (!monthly || !price || cycle === "monthly") return null;

  const fullPrice = monthly * (cycle === "yearly" ? 12 : 3);
  const amount = fullPrice - price;
  if (amount <= 0) return null;

  return { amount, percent: Math.round((amount / fullPrice) * 100) };
}
