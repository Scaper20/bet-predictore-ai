import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { balances, minPayout, type Balance, type CommissionRecord, type PayoutLine } from "@/lib/partners";

export interface PartnerRow {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  userId: string | null;
  rateBps: number;
  status: "active" | "suspended";
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  notes: string | null;
  createdAt: string;
}

const PARTNER_COLUMNS = "id, slug, name, email, user_id, rate_bps, status, bank_name, account_number, account_name, notes, created_at";

function partnerFrom(r: Record<string, unknown>): PartnerRow {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    email: (r.email as string | null) ?? null,
    userId: (r.user_id as string | null) ?? null,
    rateBps: r.rate_bps as number,
    status: r.status as "active" | "suspended",
    bankName: (r.bank_name as string | null) ?? null,
    accountNumber: (r.account_number as string | null) ?? null,
    accountName: (r.account_name as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Rows fetched at most per query; the program is new, and a partner past this needs a grouped query. */
const ROW_LIMIT = 20_000;

export interface PartnerSummary extends PartnerRow {
  signups: number;
  /** Distinct users who paid and earned the partner a commission. */
  subscribers: number;
  balances: Balance[];
}

export interface PartnersOverview {
  partners: PartnerSummary[];
  /** Across every partner, per currency. */
  totals: Balance[];
  signups: number;
  subscribers: number;
}

export async function getPartnersOverview(): Promise<PartnersOverview> {
  const admin = supabaseAdmin();
  const [partnersRes, commissionsRes, signupsRes] = await Promise.all([
    admin.from("partners").select(PARTNER_COLUMNS).order("created_at", { ascending: false }),
    admin
      .from("partner_commissions")
      .select("partner_id, user_id, kind, currency, amount_minor, status, payable_at")
      .limit(ROW_LIMIT),
    admin.from("profiles").select("referred_by_partner").not("referred_by_partner", "is", null).limit(ROW_LIMIT),
  ]);

  const commissions = (commissionsRes.data ?? []) as (CommissionRecord & { partner_id: string; user_id: string | null; kind: string })[];
  const signupCount = new Map<string, number>();
  for (const s of signupsRes.data ?? []) {
    const id = (s as { referred_by_partner: string }).referred_by_partner;
    signupCount.set(id, (signupCount.get(id) ?? 0) + 1);
  }

  const partners = (partnersRes.data ?? []).map((raw) => {
    const p = partnerFrom(raw as Record<string, unknown>);
    const mine = commissions.filter((c) => c.partner_id === p.id);
    const payers = new Set(mine.filter((c) => c.kind === "commission" && c.status !== "reversed" && c.user_id).map((c) => c.user_id));
    return { ...p, signups: signupCount.get(p.id) ?? 0, subscribers: payers.size, balances: balances(mine) };
  });

  return {
    partners,
    totals: balances(commissions),
    signups: partners.reduce((n, p) => n + p.signups, 0),
    subscribers: partners.reduce((n, p) => n + p.subscribers, 0),
  };
}

export interface CommissionView {
  id: string;
  kind: "commission" | "clawback";
  userEmail: string | null;
  plan: string | null;
  provider: string | null;
  currency: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  rateBps: number;
  amountMinor: number;
  status: "pending" | "paid" | "reversed";
  payableAt: string;
  paidAt: string | null;
  reversalReason: string | null;
  reference: string;
  createdAt: string;
}

export interface PayoutView {
  id: string;
  currency: string;
  totalMinor: number;
  commissions: number;
  reference: string | null;
  note: string | null;
  paidByEmail: string | null;
  paidAt: string;
}

export interface SignupView {
  userId: string;
  email: string | null;
  signedUpAt: string;
  referredAt: string | null;
  paid: boolean;
}

export interface PartnerDetail {
  partner: PartnerRow;
  balances: Balance[];
  commissions: CommissionView[];
  payouts: PayoutView[];
  signups: SignupView[];
  signupCount: number;
  accountEmail: string | null;
}

export async function getPartnerDetail(id: string): Promise<PartnerDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = supabaseAdmin();
  const { data: raw } = await admin.from("partners").select(PARTNER_COLUMNS).eq("id", id).maybeSingle();
  if (!raw) return null;
  const partner = partnerFrom(raw as Record<string, unknown>);

  const [commissionsRes, payoutsRes, signupsRes, signupCount, account] = await Promise.all([
    admin
      .from("partner_commissions")
      .select(
        "id, kind, plan, provider, currency, gross_minor, fee_minor, net_minor, rate_bps, amount_minor, status, payable_at, paid_at, reversal_reason, payment_reference, created_at, user_id, profiles(email)",
      )
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT),
    admin.from("partner_payouts").select("id, currency, total_minor, commissions, reference, note, paid_by_email, paid_at").eq("partner_id", id).order("paid_at", { ascending: false }).limit(100),
    admin.from("profiles").select("id, email, created_at, referred_at").eq("referred_by_partner", id).order("created_at", { ascending: false }).limit(100),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by_partner", id),
    partner.userId ? admin.from("profiles").select("email").eq("id", partner.userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const rows = (commissionsRes.data ?? []) as unknown as (Record<string, unknown> & { profiles: { email: string | null } | { email: string | null }[] | null })[];
  const payers = new Set(rows.filter((r) => r.kind === "commission" && r.status !== "reversed" && r.user_id).map((r) => r.user_id as string));
  const emailOf = (p: { email: string | null } | { email: string | null }[] | null) => (Array.isArray(p) ? p[0]?.email : p?.email) ?? null;

  return {
    partner,
    balances: balances(rows as unknown as CommissionRecord[]),
    commissions: rows.slice(0, 200).map((r) => ({
      id: r.id as string,
      kind: r.kind as "commission" | "clawback",
      userEmail: emailOf(r.profiles),
      plan: (r.plan as string | null) ?? null,
      provider: (r.provider as string | null) ?? null,
      currency: r.currency as string,
      grossMinor: Number(r.gross_minor),
      feeMinor: Number(r.fee_minor),
      netMinor: Number(r.net_minor),
      rateBps: r.rate_bps as number,
      amountMinor: Number(r.amount_minor),
      status: r.status as "pending" | "paid" | "reversed",
      payableAt: r.payable_at as string,
      paidAt: (r.paid_at as string | null) ?? null,
      reversalReason: (r.reversal_reason as string | null) ?? null,
      reference: r.payment_reference as string,
      createdAt: r.created_at as string,
    })),
    payouts: (payoutsRes.data ?? []).map((r) => ({
      id: r.id as string,
      currency: r.currency as string,
      totalMinor: Number(r.total_minor),
      commissions: r.commissions as number,
      reference: (r.reference as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      paidByEmail: (r.paid_by_email as string | null) ?? null,
      paidAt: r.paid_at as string,
    })),
    signups: (signupsRes.data ?? []).map((r) => ({
      userId: r.id as string,
      email: (r.email as string | null) ?? null,
      signedUpAt: r.created_at as string,
      referredAt: (r.referred_at as string | null) ?? null,
      paid: payers.has(r.id as string),
    })),
    signupCount: signupCount.count ?? 0,
    accountEmail: (account.data as { email: string | null } | null)?.email ?? null,
  };
}

/** Every active partner and currency that is due a payout now, for the bank-transfer sheet. */
export async function getPayoutSheet(): Promise<PayoutLine[]> {
  const { partners } = await getPartnersOverview();
  return partners
    .filter((p) => p.status === "active")
    .flatMap((p) =>
      p.balances
        .filter((b) => b.payoutDue && b.payable >= minPayout(b.currency))
        .map((b) => ({
          partner: p.name,
          slug: p.slug,
          bankName: p.bankName,
          accountNumber: p.accountNumber,
          accountName: p.accountName,
          currency: b.currency,
          amountMinor: b.payable,
        })),
    );
}
