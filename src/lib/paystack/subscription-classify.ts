import type { PaystackCharge } from "@/lib/paystack/client";

/**
 * What a card subscription's state means, ours against Paystack's. Pure, so
 * every case is tested without Paystack or a database
 * (subscription-classify.test.ts). Used by the daily subscription check.
 */

export type FindingKind =
  /** Both sides agree. */
  | "ok"
  /** Paystack took a renewal we never recorded: the member paid and may have lost access. */
  | "missed_renewal"
  /** Our period is over and Paystack is retrying a failed charge (status "attention"). */
  | "payment_failing"
  /** Our period is over and Paystack has ended the subscription. */
  | "ended"
  /** Our period is over because the renewal charge was reversed by the card issuer: no money was received. */
  | "charge_reversed"
  /** Our period is over, no charge, and Paystack still calls it active. */
  | "lapsed_unexplained"
  /** Still paid up, but Paystack will not renew it and we still say active. */
  | "will_not_renew"
  /** Both active, but the next charge date and our paid-through date disagree by more than 2 days. */
  | "date_drift";

export interface SubscriptionFinding {
  kind: FindingKind;
  userId: string;
  detail: string;
  unseen: PaystackCharge[];
  action?: string;
}

export interface ClassifyInput {
  ours: { userId: string; tier: string; status: string; periodEnd: Date | null };
  paystack: { status: string; nextPaymentDate: string | null; planAmount: number | null };
  /** Paystack's successful charges for this customer around and after our period end. */
  charges: PaystackCharge[];
  /** Charges the card issuer reversed around our period end (status "reversed" on Paystack). */
  reversed?: PaystackCharge[];
  /** References already in our payments table. */
  knownReferences: Set<string>;
  now: Date;
}

const DAY = 86_400_000;
const ENDED = new Set(["cancelled", "completed", "non-renewing"]);

export function classifySubscription(i: ClassifyInput): SubscriptionFinding {
  const base = { userId: i.ours.userId, unseen: [] as PaystackCharge[] };
  const end = i.ours.periodEnd;
  const endText = end ? end.toISOString().slice(0, 10) : "none";

  // A renewal is a successful charge of the plan's amount we have not stored.
  const unseen = i.charges.filter(
    (c) => c.status === "success" && !i.knownReferences.has(c.reference) && (i.paystack.planAmount == null || c.amount === i.paystack.planAmount),
  );
  if (unseen.length) {
    return {
      ...base,
      kind: "missed_renewal",
      unseen,
      detail: `${unseen.length} renewal charge(s) on Paystack not in our records (${unseen.map((c) => c.reference).join(", ")}); our period ended ${endText}`,
    };
  }

  const lapsed = !end || end.getTime() < i.now.getTime();
  const ps = i.paystack.status;

  if (!end || lapsed) {
    if (ps === "attention") return { ...base, kind: "payment_failing", detail: `period ended ${endText}; Paystack is retrying a failed charge` };
    if (ENDED.has(ps)) {
      return i.ours.status === "cancelled"
        ? { ...base, kind: "ok", detail: "" }
        : { ...base, kind: "ended", detail: `period ended ${endText}; Paystack status ${ps}` };
    }
    const reversed = (i.reversed ?? []).filter((c) => i.paystack.planAmount == null || c.amount === i.paystack.planAmount);
    if (reversed.length) {
      const r = reversed[0];
      return {
        ...base,
        kind: "charge_reversed",
        detail: `period ended ${endText}; the renewal charge ${r.reference} (${r.amount / 100} ${r.currency ?? "NGN"}${r.paid_at ? `, ${r.paid_at.slice(0, 10)}` : ""}) was reversed by the card issuer, so no money was received; Paystack status ${ps}, next charge ${i.paystack.nextPaymentDate ?? "none"}`,
      };
    }
    return { ...base, kind: "lapsed_unexplained", detail: `period ended ${endText}; no charge found; Paystack status ${ps}, next charge ${i.paystack.nextPaymentDate ?? "none"}` };
  }

  if (ENDED.has(ps) && i.ours.status === "active") {
    return { ...base, kind: "will_not_renew", detail: `paid to ${endText}; Paystack status ${ps}` };
  }
  if (ps === "active" && i.paystack.nextPaymentDate) {
    const next = Date.parse(i.paystack.nextPaymentDate);
    if (Number.isFinite(next) && Math.abs(next - end.getTime()) > 2 * DAY) {
      return { ...base, kind: "date_drift", detail: `paid to ${endText}; Paystack next charge ${i.paystack.nextPaymentDate.slice(0, 10)}` };
    }
  }
  return { ...base, kind: "ok", detail: "" };
}
