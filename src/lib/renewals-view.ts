import { cycleFromPlanLabel } from "@/lib/paystack/charge-kind";

/**
 * What the admin's Renewals page shows, worked out from the subscriptions and
 * payments we hold (CTO review, 4 Nov 2026, item 1.5). Pure, so each rule is
 * tested without a database. It reads our records only: whether Paystack
 * agrees is what the "Check with Paystack" button and the daily check do.
 */

export interface SubRow {
  userId: string;
  email: string | null;
  tier: string;
  status: string;
  provider: string | null;
  subscriptionCode: string | null;
  periodEnd: string | null;
}

export interface PayRow {
  userId: string;
  plan: string;
  amountKobo: number;
  createdAt: string;
  reference: string;
}

export type PlanKind = "card" | "pay-once" | "manual";

export interface RenewalItem {
  userId: string;
  email: string | null;
  tier: string;
  kind: PlanKind;
  cycle: string | null;
  /** What the next card charge should be, from their last payment. */
  amountKobo: number | null;
  periodEnd: string | null;
  /** Whole days from now to the end (negative once it has passed). */
  daysLeft: number | null;
  status: string;
}

export interface AttentionItem {
  item: RenewalItem;
  reasons: string[];
}

export interface RenewalPayment {
  email: string | null;
  plan: string;
  amountKobo: number;
  createdAt: string;
  reference: string;
}

export interface RenewalsView {
  cardActive: number;
  dueSoon: RenewalItem[];
  dueSoonKobo: number;
  lapsingOnce: RenewalItem[];
  needsAttention: AttentionItem[];
  recent: RenewalPayment[];
}

const DAY = 86_400_000;
export const DUE_WINDOW_DAYS = 14;
const PREPAID = new Set(["paystack_once", "flutterwave"]);

export function planKind(s: Pick<SubRow, "provider" | "subscriptionCode">): PlanKind {
  if (s.subscriptionCode) return "card";
  if (s.provider && PREPAID.has(s.provider)) return "pay-once";
  return "manual";
}

/** A card-plan payment: "vip:monthly" or a renewal we could not label. Not pay-once, not a pass. */
const isCardPlan = (plan: string) => plan === "renewal" || (/^(pro|vip):(monthly|quarterly|yearly)$/.test(plan));

export function buildRenewalsView(input: { subs: SubRow[]; payments: PayRow[]; now?: Date }): RenewalsView {
  const now = input.now ?? new Date();
  const emailOf = new Map(input.subs.map((s) => [s.userId, s.email]));

  const byUser = new Map<string, PayRow[]>();
  for (const p of [...input.payments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  }

  const toItem = (s: SubRow): RenewalItem => {
    const paid = (byUser.get(s.userId) ?? []).filter((p) => isCardPlan(p.plan) || /^(pro|vip):(monthly|quarterly|yearly):once$/.test(p.plan));
    const last = paid[paid.length - 1];
    const end = s.periodEnd ? Date.parse(s.periodEnd) : NaN;
    return {
      userId: s.userId,
      email: s.email,
      tier: s.tier,
      kind: planKind(s),
      cycle: cycleFromPlanLabel(last?.plan) ?? null,
      amountKobo: last?.amountKobo ?? null,
      periodEnd: Number.isFinite(end) ? new Date(end).toISOString() : null,
      daysLeft: Number.isFinite(end) ? Math.floor((end - now.getTime()) / DAY) : null,
      status: s.status,
    };
  };

  const paidTiers = input.subs.filter((s) => s.tier === "pro" || s.tier === "vip");
  const items = paidTiers.map(toItem);

  const withinWindow = (i: RenewalItem) => i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= DUE_WINDOW_DAYS;
  const byEnd = (a: RenewalItem, b: RenewalItem) => Date.parse(a.periodEnd ?? "") - Date.parse(b.periodEnd ?? "");

  const dueSoon = items.filter((i) => i.kind === "card" && i.status !== "cancelled" && withinWindow(i)).sort(byEnd);
  const lapsingOnce = items.filter((i) => i.kind === "pay-once" && i.status === "active" && withinWindow(i)).sort(byEnd);

  const needsAttention: AttentionItem[] = [];
  const unlabelled = new Set(input.payments.filter((p) => p.plan === "renewal").map((p) => p.userId));
  for (const i of items) {
    if (i.kind !== "card") continue;
    const reasons: string[] = [];
    const ended = i.daysLeft !== null && i.daysLeft < 0;
    if (i.status === "cancelled") {
      // They chose to stop: nothing to chase, only an end date to show.
    } else {
      if (i.periodEnd === null) reasons.push("No paid-through date is saved.");
      else if (ended && i.status === "active") {
        reasons.push(`The paid period ended ${-(i.daysLeft as number)} day(s) ago and no renewal is recorded, yet the plan still says active.`);
      } else if (ended) reasons.push(`The paid period ended ${-(i.daysLeft as number)} day(s) ago (status ${i.status}).`);
      if (i.status === "past_due") reasons.push("Paystack could not charge the last renewal and is retrying.");
      if (unlabelled.has(i.userId)) reasons.push("A renewal was recorded whose billing cycle could not be worked out, so the date may not have moved.");
    }
    if (reasons.length) needsAttention.push({ item: i, reasons });
  }
  needsAttention.sort((a, b) => (a.item.daysLeft ?? -9999) - (b.item.daysLeft ?? -9999));

  // A renewal is any card-plan payment after the member's first one.
  const recent: RenewalPayment[] = [];
  for (const [userId, list] of byUser) {
    const card = list.filter((p) => isCardPlan(p.plan));
    card.slice(1).forEach((p) => {
      if (now.getTime() - Date.parse(p.createdAt) <= 30 * DAY) {
        recent.push({ email: emailOf.get(userId) ?? null, plan: p.plan, amountKobo: p.amountKobo, createdAt: p.createdAt, reference: p.reference });
      }
    });
  }
  recent.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    cardActive: items.filter((i) => i.kind === "card" && i.status !== "cancelled").length,
    dueSoon,
    dueSoonKobo: dueSoon.reduce((sum, i) => sum + (i.amountKobo ?? 0), 0),
    lapsingOnce,
    needsAttention,
    recent,
  };
}
