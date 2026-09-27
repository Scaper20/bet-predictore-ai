import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { APP_TIMEZONE } from "@/lib/format";

/**
 * Every function here trusts its caller already ran requireAdmin()/
 * checkAdmin() — same trust boundary as getSubscriptionRow(supabase, userId)
 * in lib/subscriptions.ts, which trusts its caller rather than re-checking
 * auth itself.
 *
 * PostgREST (what supabase-js's .from() calls go through) has no GROUP BY —
 * count/sum work as single aggregates, but grouped breakdowns don't exist as
 * a REST call. Given this app's scale today, grouped figures below pull
 * bounded raw rows and aggregate in TypeScript, consistent with this
 * codebase's existing philosophy of keeping logic in TS, not the database
 * (getEntitlement(), evaluatePick() are both plain TS).
 */

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

export interface DashboardKpis {
  registeredUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  newUsers7d: number;
  revenueThisMonthKobo: number;
  revenueAllTimeKobo: number;
  revenueTrend: { day: string; kobo: number }[]; // last 30 days, oldest first
  tierBreakdown: Record<"free" | "pass" | "pro" | "vip", number>;
  passSalesCount: number;
  stalePendingPayments7d: number;
  settledPicks: { wins: number; losses: number; pushes: number; winRate: number | null };
  openTicketCount: number;
  pendingTicketCount: number;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const admin = supabaseAdmin();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const cutoff7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const cutoff30d = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const cutoff1h = new Date(now.getTime() - 3_600_000).toISOString();

  const [
    registeredUsers,
    activeUsers7d,
    activeUsers30d,
    newUsers7d,
    monthPayments,
    allTimePayments,
    trendPayments,
    subscriptions,
    passSales,
    stalePendingPayments7d,
    wins,
    losses,
    pushes,
    openTicketCount,
    pendingTicketCount,
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", cutoff7d),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", cutoff30d),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", cutoff7d),
    admin.from("payments").select("amount_kobo").eq("status", "success").gte("created_at", startOfMonth),
    admin.from("payments").select("amount_kobo").eq("status", "success"),
    admin.from("payments").select("amount_kobo, created_at").eq("status", "success").gte("created_at", cutoff30d),
    admin.from("subscriptions").select("tier").in("status", ["active", "past_due"]),
    // Checkout writes plan as `${tier}:${cycle}` (src/app/api/billing/checkout/route.ts)
    // — Pass is always "pass:monthly" even though it's a one-off, not a plain "pass".
    admin.from("payments").select("*", { count: "exact", head: true }).eq("status", "success").like("plan", "pass:%"),
    // Never transitions out of "pending" — Paystack's webhook only handles
    // charge.success today, not charge.failed (see the confidence note atop
    // api/billing/webhook/route.ts) — so a checkout that failed or was
    // abandoned just sits here. "Pending for over an hour" is the proxy for
    // "this payment did not go through" until that handler exists.
    admin
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", cutoff7d)
      .lt("created_at", cutoff1h),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "win"),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "lose"),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "push"),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const revenueThisMonthKobo = (monthPayments.data ?? []).reduce((sum, p) => sum + (p.amount_kobo as number), 0);
  const revenueAllTimeKobo = (allTimePayments.data ?? []).reduce((sum, p) => sum + (p.amount_kobo as number), 0);

  const trendByDay = new Map<string, number>();
  for (const p of trendPayments.data ?? []) {
    const key = dayKey(p.created_at as string);
    trendByDay.set(key, (trendByDay.get(key) ?? 0) + (p.amount_kobo as number));
  }
  const revenueTrend: { day: string; kobo: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = dayKey(new Date(now.getTime() - i * 86_400_000).toISOString());
    revenueTrend.push({ day: d, kobo: trendByDay.get(d) ?? 0 });
  }

  const tierBreakdown: DashboardKpis["tierBreakdown"] = { free: 0, pass: 0, pro: 0, vip: 0 };
  for (const s of subscriptions.data ?? []) {
    const tier = s.tier as keyof DashboardKpis["tierBreakdown"];
    if (tier in tierBreakdown) tierBreakdown[tier]++;
  }

  const winCount = wins.count ?? 0;
  const loseCount = losses.count ?? 0;
  const pushCount = pushes.count ?? 0;
  const graded = winCount + loseCount;

  return {
    registeredUsers: registeredUsers.count ?? 0,
    activeUsers7d: activeUsers7d.count ?? 0,
    activeUsers30d: activeUsers30d.count ?? 0,
    newUsers7d: newUsers7d.count ?? 0,
    revenueThisMonthKobo,
    revenueAllTimeKobo,
    revenueTrend,
    tierBreakdown,
    passSalesCount: passSales.count ?? 0,
    stalePendingPayments7d: stalePendingPayments7d.count ?? 0,
    settledPicks: {
      wins: winCount,
      losses: loseCount,
      pushes: pushCount,
      winRate: graded > 0 ? winCount / graded : null,
    },
    openTicketCount: openTicketCount.count ?? 0,
    pendingTicketCount: pendingTicketCount.count ?? 0,
  };
}

/* ------------------------------------------------------------- Recent activity */

export interface RecentSignup {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface RecentPayment {
  id: string;
  email: string | null;
  amountKobo: number;
  plan: string;
  status: string;
  createdAt: string;
}

export interface RecentTicket {
  id: string;
  subject: string;
  status: string;
  email: string | null;
  updatedAt: string;
}

export interface RecentActivity {
  signups: RecentSignup[];
  payments: RecentPayment[];
  tickets: RecentTicket[];
}

interface ProfileJoin {
  email: string | null;
}

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** Feeds the dashboard's "what just happened" panels — the newest handful
 * of signups, payments and tickets, each capped at 8 so the panel stays
 * scannable rather than becoming a second copy of /admin/users. */
export async function getRecentActivity(): Promise<RecentActivity> {
  const admin = supabaseAdmin();
  const LIMIT = 8;

  const [signups, payments, tickets] = await Promise.all([
    admin.from("profiles").select("id, email, display_name, created_at").order("created_at", { ascending: false }).limit(LIMIT),
    admin
      .from("payments")
      .select("id, amount_kobo, plan, status, created_at, profiles(email)")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    admin
      .from("support_tickets")
      .select("id, subject, status, updated_at, profiles(email)")
      .order("updated_at", { ascending: false })
      .limit(LIMIT),
  ]);

  return {
    signups: (signups.data ?? []).map((s) => ({
      id: s.id as string,
      email: s.email as string | null,
      displayName: s.display_name as string | null,
      createdAt: s.created_at as string,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id as string,
      email: firstOf(p.profiles as ProfileJoin | ProfileJoin[] | null)?.email ?? null,
      amountKobo: p.amount_kobo as number,
      plan: p.plan as string,
      status: p.status as string,
      createdAt: p.created_at as string,
    })),
    tickets: (tickets.data ?? []).map((t) => ({
      id: t.id as string,
      subject: t.subject as string,
      status: t.status as string,
      email: firstOf(t.profiles as ProfileJoin | ProfileJoin[] | null)?.email ?? null,
      updatedAt: t.updated_at as string,
    })),
  };
}

/* ------------------------------------------------------------------ Payments */

export interface PaymentRow {
  id: string;
  email: string | null;
  amountKobo: number;
  plan: string;
  status: string;
  reference: string;
  createdAt: string;
}

export interface PaymentsPage {
  rows: PaymentRow[];
  hasMore: boolean;
}

/** Full transaction ledger behind /admin/payments — every payment row
 * Paystack has ever notified this app about, newest first. */
export async function getPayments(page: number, pageSize = 50): Promise<PaymentsPage> {
  const admin = supabaseAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize; // one extra row, used only to know whether a next page exists

  const { data } = await admin
    .from("payments")
    .select("id, amount_kobo, plan, status, paystack_reference, created_at, profiles(email)")
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = data ?? [];
  const hasMore = rows.length > pageSize;

  return {
    rows: rows.slice(0, pageSize).map((p) => ({
      id: p.id as string,
      email: firstOf(p.profiles as ProfileJoin | ProfileJoin[] | null)?.email ?? null,
      amountKobo: p.amount_kobo as number,
      plan: p.plan as string,
      status: p.status as string,
      reference: p.paystack_reference as string,
      createdAt: p.created_at as string,
    })),
    hasMore,
  };
}

/* ----------------------------------------------------------------- Audit log */

export interface AuditLogRow {
  id: string;
  adminEmail: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  hasMore: boolean;
}

/** Every grant/revoke/close recorded by logAdminAction() (src/lib/admin.ts),
 * newest first — the "who changed what, when" this table exists for in the
 * first place (see 0007_admin_audit_log.sql) surfaced as an actual page
 * rather than left write-only. */
export async function getAuditLog(page: number, pageSize = 50): Promise<AuditLogPage> {
  const admin = supabaseAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const { data } = await admin
    .from("admin_audit_log")
    .select("id, admin_email, action, target, detail, created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = data ?? [];
  const hasMore = rows.length > pageSize;

  return {
    rows: rows.slice(0, pageSize).map((r) => ({
      id: r.id as string,
      adminEmail: r.admin_email as string,
      action: r.action as string,
      target: r.target as string | null,
      detail: r.detail as Record<string, unknown> | null,
      createdAt: r.created_at as string,
    })),
    hasMore,
  };
}

/* ------------------------------------------------------------------ Feedback */

export interface FeedbackRow {
  id: string;
  email: string | null;
  score: number | null;
  comment: string | null;
  pagePath: string | null;
  createdAt: string;
}

export interface FeedbackPage {
  rows: FeedbackRow[];
  hasMore: boolean;
  averageScore: number | null;
}

/** Everything submitted through the feedback widget (src/components/feedback),
 * newest first. Averages only the current page's scores, not an all-time
 * figure — good enough for "is this trending okay" at a glance without a
 * second aggregate query. */
export async function getFeedback(page: number, pageSize = 50): Promise<FeedbackPage> {
  const admin = supabaseAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const { data } = await admin
    .from("feedback")
    .select("id, score, comment, page_path, created_at, profiles(email)")
    .order("created_at", { ascending: false })
    .range(from, to);

  const rawRows = data ?? [];
  const hasMore = rawRows.length > pageSize;
  const rows = rawRows.slice(0, pageSize).map((r) => ({
    id: r.id as string,
    email: firstOf(r.profiles as ProfileJoin | ProfileJoin[] | null)?.email ?? null,
    score: r.score as number | null,
    comment: r.comment as string | null,
    pagePath: r.page_path as string | null,
    createdAt: r.created_at as string,
  }));

  const scored = rows.filter((r) => r.score !== null);
  const averageScore = scored.length > 0 ? scored.reduce((s, r) => s + (r.score as number), 0) / scored.length : null;

  return { rows, hasMore, averageScore };
}

export interface MarketBreakdown {
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface CalibrationBucket {
  bucket: string;
  predictedAvg: number;
  actualWinRate: number;
  sampleSize: number;
}

export interface ModelPerformance {
  overall: { wins: number; losses: number; pushes: number; winRate: number | null };
  byMarket: Record<string, MarketBreakdown>;
  byLeague: Record<string, MarketBreakdown>;
  calibration: CalibrationBucket[];
}

interface SettledRow {
  market: string;
  league: string;
  result: "win" | "lose" | "push";
  probability: number;
}

export async function getModelPerformance(): Promise<ModelPerformance> {
  const admin = supabaseAdmin();
  // Defensive cap, not expected to bind at this app's scale — cheap insurance
  // against an unbounded fetch if settlement volume grows a lot.
  const { data } = await admin
    .from("predictions_log")
    .select("market, league, result, probability")
    .not("settled_at", "is", null)
    .not("result", "is", null)
    .limit(5000);

  const rows = (data ?? []) as SettledRow[];

  const tally = (subset: SettledRow[]) => {
    const wins = subset.filter((r) => r.result === "win").length;
    const losses = subset.filter((r) => r.result === "lose").length;
    const pushes = subset.filter((r) => r.result === "push").length;
    const graded = wins + losses;
    return { wins, losses, pushes, winRate: graded > 0 ? wins / graded : null };
  };

  const overall = tally(rows);

  const byMarket: Record<string, MarketBreakdown> = {};
  const byLeague: Record<string, MarketBreakdown> = {};
  const marketGroups = new Map<string, SettledRow[]>();
  const leagueGroups = new Map<string, SettledRow[]>();
  for (const r of rows) {
    // Group by market family (the part before the first ":"), e.g. "1x2",
    // "ou", "dc" — grouping by the full market string would fragment
    // "ou:over:2.5" from "ou:under:2.5" into separate, less useful buckets.
    const marketFamily = r.market.split(":")[0];
    (marketGroups.get(marketFamily) ?? marketGroups.set(marketFamily, []).get(marketFamily)!).push(r);
    (leagueGroups.get(r.league) ?? leagueGroups.set(r.league, []).get(r.league)!).push(r);
  }
  for (const [k, v] of marketGroups) byMarket[k] = tally(v);
  for (const [k, v] of leagueGroups) byLeague[k] = tally(v);

  // Calibration: bucket by predicted probability, rounded to the nearest
  // 10% — answers "are our ~70%-confidence picks actually winning ~70% of
  // the time." Admin-only: inappropriate to publish (same reasoning as the
  // rest of this app's honest-public-claims work), useful internally.
  const buckets = new Map<number, SettledRow[]>();
  for (const r of rows) {
    if (r.result === "push") continue; // excluded from win-rate math elsewhere too
    const bucket = Math.round(r.probability * 10) / 10;
    (buckets.get(bucket) ?? buckets.set(bucket, []).get(bucket)!).push(r);
  }
  const calibration: CalibrationBucket[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, subset]) => {
      const wins = subset.filter((r) => r.result === "win").length;
      const predictedAvg = subset.reduce((sum, r) => sum + r.probability, 0) / subset.length;
      return {
        bucket: `${Math.round(bucket * 100)}%`,
        predictedAvg,
        actualWinRate: wins / subset.length,
        sampleSize: subset.length,
      };
    });

  return { overall, byMarket, byLeague, calibration };
}

/* ---------------------------------------------------------- WhatsApp digest */

export interface WhatsappDigestRow {
  id: string;
  digestDate: string;
  hasPicks: boolean;
  picksMessage: string;
  accaMessages: string[];
  createdAt: string;
}

/** Most recent digests, newest first — today's (if generated) is rows[0]. */
export async function getWhatsappDigests(limit = 14): Promise<WhatsappDigestRow[]> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("whatsapp_digests")
    .select("id, digest_date, has_picks, picks_message, acca_messages, created_at")
    .order("digest_date", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    digestDate: r.digest_date as string,
    hasPicks: r.has_picks as boolean,
    picksMessage: r.picks_message as string,
    accaMessages: (r.acca_messages as string[] | null) ?? [],
    createdAt: r.created_at as string,
  }));
}

/* ------------------------------------------------------------- Traffic sources */

export interface ChannelBreakdown {
  label: string;
  count: number;
}

export interface AttributedSignup {
  id: string;
  email: string | null;
  createdAt: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  landingPage: string | null;
}

export interface TrafficSources {
  byReferrer: ChannelBreakdown[];
  byCampaign: ChannelBreakdown[];
  untrackedCount: number;
  trackedCount: number;
  recentSignups: AttributedSignup[];
}

interface AttributionRow {
  id: string;
  email: string | null;
  created_at: string;
  signup_referrer_host: string | null;
  signup_utm_source: string | null;
  signup_utm_medium: string | null;
  signup_utm_campaign: string | null;
  signup_landing_page: string | null;
}

function rankByCount(counts: Map<string, number>, limit = 12): ChannelBreakdown[] {
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

/**
 * First-touch attribution (0017_signup_attribution.sql, captured by
 * src/proxy.ts) grouped two ways: by referrer host — organic/social/
 * referral traffic that never carried a UTM tag — and by utm_source, for
 * traffic that arrived through a deliberately tagged link. A visit can
 * have neither (direct) or both (a tagged link clicked from a known
 * referring page); the two breakdowns are independent, not mutually
 * exclusive buckets of the same total.
 */
export async function getTrafficSources(): Promise<TrafficSources> {
  const admin = supabaseAdmin();

  // Bounded rather than paginated: this app's whole user base is a few
  // thousand rows at most today, and both breakdowns need every row
  // in-memory to count correctly, not just one page of the most recent
  // signups.
  const { data, count } = await admin
    .from("profiles")
    .select(
      "id, email, created_at, signup_referrer_host, signup_utm_source, signup_utm_medium, signup_utm_campaign, signup_landing_page",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as AttributionRow[];

  const referrerCounts = new Map<string, number>();
  const campaignCounts = new Map<string, number>();
  let trackedCount = 0;

  for (const r of rows) {
    const hasReferrer = !!r.signup_referrer_host;
    const hasCampaign = !!r.signup_utm_source;
    if (hasReferrer || hasCampaign) trackedCount++;

    const referrerLabel = hasReferrer ? r.signup_referrer_host! : "Direct / no referrer";
    referrerCounts.set(referrerLabel, (referrerCounts.get(referrerLabel) ?? 0) + 1);

    if (hasCampaign) {
      const campaignLabel = r.signup_utm_medium ? `${r.signup_utm_source} / ${r.signup_utm_medium}` : r.signup_utm_source!;
      campaignCounts.set(campaignLabel, (campaignCounts.get(campaignLabel) ?? 0) + 1);
    }
  }

  const recentSignups: AttributedSignup[] = rows.slice(0, 25).map((r) => ({
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    referrerHost: r.signup_referrer_host,
    utmSource: r.signup_utm_source,
    utmMedium: r.signup_utm_medium,
    utmCampaign: r.signup_utm_campaign,
    landingPage: r.signup_landing_page,
  }));

  return {
    byReferrer: rankByCount(referrerCounts),
    byCampaign: rankByCount(campaignCounts),
    untrackedCount: (count ?? rows.length) - trackedCount,
    trackedCount,
    recentSignups,
  };
}
