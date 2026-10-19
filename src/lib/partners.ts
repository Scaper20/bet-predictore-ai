/**
 * Partner program rules, in one place and pure: the deal's numbers, the link,
 * what a payment earns, and what a partner is owed. The server code that reads
 * and writes the tables (partners-feed.ts, the admin actions) and the tests
 * share these, so what the admin shows and what a payout pays cannot drift.
 *
 * The deal: a partner earns RATE of the net payment (the amount paid minus the
 * processor's fee) on every payment from a user they brought, for the user's
 * first 12 months as a payer. A commission is held 14 days, the refund window,
 * then payable. Money is in minor units of the payment's own currency.
 */

import { formatMoney } from "@/lib/payments/markets";

export const DEFAULT_RATE_BPS = 2000; // 20%
export const MAX_RATE_BPS = 5000;
/** Days a commission is held before it can be paid: the refund window plus a margin for chargebacks. */
export const HOLD_DAYS = 14;
/** Months of a user's payments that earn a commission, counted from their first one. */
export const WINDOW_MONTHS = 12;
/** Days from a user's first partner-link click in which signing up credits the partner. */
export const ATTRIBUTION_DAYS = 90;
/** The least a payout may be, per currency, in minor units. Smaller balances roll over. ₦10,000 in naira. */
export const MIN_PAYOUT_MINOR: Readonly<Record<string, number>> = { NGN: 1_000_000 };

export const minPayout = (currency: string): number => MIN_PAYOUT_MINOR[currency] ?? 0;

/* ------------------------------------------------------------------ link */

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

/** "Ada Tips!" -> "ada-tips". The cleaned form of whatever an admin typed. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

export function validSlug(slug: string): boolean {
  return SLUG.test(slug) && !slug.includes("--");
}

/** The link a partner shares: the home page with their code on it. */
export function partnerLink(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/?ref=${slug}`;
}

/* ----------------------------------------------------------------- money */

export const pctText = (rateBps: number): string => `${(rateBps / 100).toFixed(rateBps % 100 === 0 ? 0 : 1)}%`;

/** A minor-units amount the way the site writes money: "₦9,436". */
export const moneyText = (minor: number, currency: string): string => formatMoney(minor / 100, currency);

/**
 * The processor's fee when the payment record does not carry the real one:
 * Paystack's local rate (1.5% plus ₦100 from ₦2,500, capped at ₦2,000), and
 * Flutterwave's (1.4% locally, 3.8% on international cards, capped likewise).
 * A fallback only: where the webhook reports the fee actually charged, use that.
 */
export function estimateFeeMinor(provider: string | null | undefined, currency: string, grossMinor: number): number {
  if (grossMinor <= 0) return 0;
  const rate = provider === "flutterwave" ? (currency === "NGN" ? 0.014 : 0.038) : 0.015;
  const flat = provider !== "flutterwave" && currency === "NGN" && grossMinor >= 250_000 ? 10_000 : 0;
  const cap = currency === "NGN" ? 200_000 : Number.POSITIVE_INFINITY;
  return Math.min(cap, Math.round(grossMinor * rate) + flat);
}

export const netMinor = (grossMinor: number, feeMinor: number): number => Math.max(0, grossMinor - Math.max(0, feeMinor));

export const commissionMinor = (net: number, rateBps: number): number => Math.round((Math.max(0, net) * rateBps) / 10_000);

/* -------------------------------------------------------- earning a row */

export interface CommissionInput {
  partner: { id: string; rateBps: number };
  userId: string;
  payment: {
    reference: string;
    provider?: string | null;
    plan?: string | null;
    currency: string;
    grossMinor: number;
    /** The fee the processor charged, when known. */
    feeMinor?: number | null;
    status: string;
    paidAt: Date;
  };
  /** When this user's first successful payment was made (this one, if it is the first). */
  firstPaidAt: Date;
}

export interface CommissionRow {
  partner_id: string;
  user_id: string;
  payment_reference: string;
  provider: string | null;
  plan: string | null;
  currency: string;
  gross_minor: number;
  fee_minor: number;
  net_minor: number;
  rate_bps: number;
  amount_minor: number;
  payable_at: string;
}

export type CommissionResult =
  | { ok: true; row: CommissionRow }
  | { ok: false; reason: "payment_not_successful" | "outside_window" | "nothing_to_pay" };

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** Whether a payment falls inside the 12 months after the user's first. */
export function inCommissionWindow(firstPaidAt: Date, paidAt: Date): boolean {
  return paidAt.getTime() < addMonths(firstPaidAt, WINDOW_MONTHS).getTime();
}

/**
 * What a payment earns its partner, as the row to store, or why it earns
 * nothing. The caller has already established that the user was brought by
 * this partner; the rate is the one in force when the payment is made.
 */
export function buildCommission(input: CommissionInput): CommissionResult {
  const { partner, userId, payment, firstPaidAt } = input;
  if (payment.status !== "success") return { ok: false, reason: "payment_not_successful" };
  if (!inCommissionWindow(firstPaidAt, payment.paidAt)) return { ok: false, reason: "outside_window" };

  const fee = payment.feeMinor ?? estimateFeeMinor(payment.provider, payment.currency, payment.grossMinor);
  const net = netMinor(payment.grossMinor, fee);
  const amount = commissionMinor(net, partner.rateBps);
  if (amount <= 0) return { ok: false, reason: "nothing_to_pay" };

  return {
    ok: true,
    row: {
      partner_id: partner.id,
      user_id: userId,
      payment_reference: payment.reference,
      provider: payment.provider ?? null,
      plan: payment.plan ?? null,
      currency: payment.currency,
      gross_minor: payment.grossMinor,
      fee_minor: fee,
      net_minor: net,
      rate_bps: partner.rateBps,
      amount_minor: amount,
      payable_at: new Date(payment.paidAt.getTime() + HOLD_DAYS * 86_400_000).toISOString(),
    },
  };
}

/* --------------------------------------------------------------- balances */

export interface CommissionRecord {
  status: "pending" | "paid" | "reversed";
  currency: string;
  amount_minor: number;
  payable_at: string;
}

/** What the admin calls a commission: held until its refund window ends, then payable. */
export type Standing = "held" | "payable" | "paid" | "reversed";

export function standing(c: Pick<CommissionRecord, "status" | "payable_at">, now = Date.now()): Standing {
  if (c.status === "paid") return "paid";
  if (c.status === "reversed") return "reversed";
  return Date.parse(c.payable_at) <= now ? "payable" : "held";
}

export interface Balance {
  currency: string;
  /** Earned and still inside the refund window. */
  held: number;
  /** Past the window and not yet paid: what a payout would pay (clawbacks already taken off). */
  payable: number;
  paid: number;
  /** Whether a payout can be made now: payable meets the minimum. */
  payoutDue: boolean;
}

/** Balances per currency from a partner's commission rows. */
export function balances(rows: CommissionRecord[], now = Date.now()): Balance[] {
  const by = new Map<string, Balance>();
  for (const r of rows) {
    const b = by.get(r.currency) ?? { currency: r.currency, held: 0, payable: 0, paid: 0, payoutDue: false };
    by.set(r.currency, b);
    const s = standing(r, now);
    if (s === "held") b.held += r.amount_minor;
    else if (s === "payable") b.payable += r.amount_minor;
    else if (s === "paid") b.paid += r.amount_minor;
  }
  for (const b of by.values()) b.payoutDue = b.payable > 0 && b.payable >= minPayout(b.currency);
  return [...by.values()].sort((a, b) => (a.currency === "NGN" ? -1 : b.currency === "NGN" ? 1 : a.currency.localeCompare(b.currency)));
}

/* -------------------------------------------------------------------- CSV */

export interface PayoutLine {
  partner: string;
  slug: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  currency: string;
  amountMinor: number;
}

const cell = (v: string | number | null): string => {
  const s = v === null ? "" : String(v);
  // A leading = + - @ makes a spreadsheet treat the cell as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The bank-transfer sheet: one line per partner and currency that is due a payout. */
export function payoutCsv(lines: PayoutLine[]): string {
  const head = ["Partner", "Code", "Bank", "Account number", "Account name", "Currency", "Amount"];
  const rows = lines.map((l) => [l.partner, l.slug, l.bankName, l.accountNumber, l.accountName, l.currency, (l.amountMinor / 100).toFixed(2)]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
