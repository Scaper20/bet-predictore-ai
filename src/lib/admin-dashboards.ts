import "server-only";

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { paidUserIds } from "@/lib/paid-users";
import { HUB_MIN_TARGET_SHARE, HUB_TIERS, hubDay } from "@/lib/code-hub";
import { paymentAmount } from "@/lib/payments/markets";
import {
  byDay, change, channelOf, hitRate, hoursBetween, rank, sumBetween, type DayPoint,
} from "@/lib/admin-metrics";

/**
 * The numbers behind the four role dashboards (app/admin/(protected)/page.tsx).
 *
 * Each loader trusts that its caller checked the viewer may see it (the page
 * only calls the loaders of the dashboards the viewer's roles open). Reads go
 * through the service-role client like the rest of the admin. The base reads
 * are wrapped in React's cache(), so the owner opening several dashboards in
 * one request reads payments, signups and picks once.
 *
 * Volumes are small (hundreds of users, tens of payments a month), so the
 * reads pull bounded rows and aggregate in TypeScript, as admin-analytics.ts
 * does. Revisit with SQL views when a read passes a few thousand rows.
 */

const DAY = 86_400_000;
const WINDOW = 30;

/* ---------------------------------------------------------------- base reads */

interface PaymentRow {
  id: string;
  user_id: string | null;
  plan: string;
  status: string;
  amount_kobo: number;
  currency: string | null;
  amount_minor: number | null;
  provider: string | null;
  created_at: string;
  profiles?: { email: string | null } | { email: string | null }[] | null;
}

/** Payments from the last 60 days, so the current 30 can be compared with the 30 before. */
const recentPayments = cache(async (): Promise<PaymentRow[]> => {
  const since = new Date(Date.now() - 2 * WINDOW * DAY).toISOString();
  const { data } = await supabaseAdmin()
    .from("payments")
    .select("id, user_id, plan, status, amount_kobo, currency, amount_minor, provider, created_at, profiles(email)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as PaymentRow[];
});

interface SignupRow {
  id: string;
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  signup_utm_source: string | null;
  signup_utm_campaign: string | null;
  signup_referrer_host: string | null;
  signup_landing_page: string | null;
  referred_by_partner: string | null;
  marketing_opt_out: boolean | null;
}

/** Every profile, newest first. A few hundred today; bounded so this stays a single read. */
const allProfiles = cache(async (): Promise<SignupRow[]> => {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select(
      "id, email, created_at, last_seen_at, signup_utm_source, signup_utm_campaign, signup_referrer_host, signup_landing_page, referred_by_partner, marketing_opt_out",
    )
    .order("created_at", { ascending: false })
    .limit(10_000);
  return (data ?? []) as SignupRow[];
});

interface PickRow {
  kickoff: string;
  result: string | null;
  pick_tier: string | null;
  probability: number | null;
}

/** Published picks from the last 60 days, settled or not. */
const recentPicks = cache(async (): Promise<PickRow[]> => {
  const since = new Date(Date.now() - 2 * WINDOW * DAY).toISOString();
  const { data } = await supabaseAdmin()
    .from("predictions_log")
    .select("kickoff, result, pick_tier, probability")
    .gte("kickoff", since)
    .limit(10_000);
  return (data ?? []) as PickRow[];
});

const paying = cache(async () => paidUserIds(supabaseAdmin()));

const isSuccess = (p: PaymentRow) => p.status === "success";
const naira = (p: PaymentRow) => (p.amount_kobo ?? 0) / 100;
const planFamily = (plan: string) => (plan.startsWith("vip") ? "VIP" : plan.startsWith("pro") ? "Pro" : plan.startsWith("pass") ? "Pass" : "Other");

function emailOf(p: PaymentRow): string | null {
  const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
  return prof?.email ?? null;
}

export interface PickStats {
  wins: number;
  losses: number;
  pushes: number;
  open: number;
  rate: number | null;
}

function pickStats(rows: readonly PickRow[], from: number, to: number, strongOnly = false): PickStats {
  const s = { wins: 0, losses: 0, pushes: 0, open: 0 };
  for (const r of rows) {
    const t = Date.parse(r.kickoff);
    if (t < from || t >= to) continue;
    if (strongOnly && r.pick_tier !== "strong") continue;
    if (r.result === "win") s.wins++;
    else if (r.result === "lose") s.losses++;
    else if (r.result === "push") s.pushes++;
    else s.open++;
  }
  return { ...s, rate: hitRate(s.wins, s.losses) };
}

/** Daily hit rate over the window, with the record in the tooltip. Days with nothing graded are zero-height. */
function dailyHitRate(rows: readonly PickRow[], now: number): DayPoint[] {
  const wins = byDay(rows.filter((r) => r.result === "win"), (r) => r.kickoff, () => 1, WINDOW, now);
  const losses = byDay(rows.filter((r) => r.result === "lose"), (r) => r.kickoff, () => 1, WINDOW, now);
  return wins.map((w, i) => {
    const l = losses[i].value;
    const rate = hitRate(w.value, l);
    return { day: w.day, value: rate ?? 0, note: w.value + l > 0 ? `${w.value}W – ${l}L` : "nothing graded" };
  });
}

/* ------------------------------------------------------------ shared panels */

export interface HubCodeCheck {
  tier: string;
  name: string;
  target: number;
  odds: number;
  legs: number;
  booked: boolean;
  /** odds / target; under HUB_MIN_TARGET_SHARE is a code published short of its name. */
  share: number;
}

/** Today's Code Hub codes against the odds each is named for. */
export const hubToday = cache(async (): Promise<HubCodeCheck[]> => {
  const { data } = await supabaseAdmin()
    .from("code_hub_codes")
    .select("tier, odds, legs, booking_code")
    .eq("day", hubDay())
    .order("tier");
  return (data ?? [])
    .map((c) => {
      const tier = HUB_TIERS.find((t) => t.id === String(c.tier));
      const target = tier?.target ?? Number(c.tier);
      const odds = Number(c.odds);
      return {
        tier: String(c.tier),
        name: tier?.name ?? `${c.tier} odds`,
        target,
        odds,
        legs: Array.isArray(c.legs) ? c.legs.length : 0,
        booked: Boolean(c.booking_code),
        share: target > 0 ? odds / target : 1,
      };
    })
    .sort((a, b) => a.target - b.target);
});

export interface IngestSummary {
  runs24h: number;
  ok24h: number;
  partial24h: number;
  failed24h: number;
  /** Minutes since the live-scores feed last wrote; null if it never has. */
  liveScoresAgeMin: number | null;
  /** Hours since the last finished-results run. */
  resultsAgeH: number | null;
  jobs: { job: string; source: string; last: string; status: string; runs: number }[];
  failures: { job: string; source: string; at: string; error: string | null }[];
}

export const ingestSummary = cache(async (): Promise<IngestSummary> => {
  const since = new Date(Date.now() - 2 * DAY).toISOString();
  const { data } = await supabaseAdmin()
    .from("ingest_runs")
    .select("job, source, status, started_at, error")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(5000);
  const rows = data ?? [];
  const dayAgo = Date.now() - DAY;
  const last24 = rows.filter((r) => Date.parse(r.started_at) >= dayAgo);
  const jobs = new Map<string, IngestSummary["jobs"][number]>();
  for (const r of rows) {
    const key = `${r.job}·${r.source}`;
    const seen = jobs.get(key);
    if (seen) seen.runs++;
    else jobs.set(key, { job: r.job, source: r.source, last: r.started_at, status: r.status, runs: 1 });
  }
  const lastOf = (job: string) => rows.find((r) => r.job === job && r.status === "ok")?.started_at ?? null;
  const live = lastOf("live-scores");
  const results = lastOf("results");
  return {
    runs24h: last24.length,
    ok24h: last24.filter((r) => r.status === "ok").length,
    partial24h: last24.filter((r) => r.status === "partial").length,
    failed24h: last24.filter((r) => r.status === "failed").length,
    liveScoresAgeMin: live ? Math.round((Date.now() - Date.parse(live)) / 60_000) : null,
    resultsAgeH: results ? hoursBetween(results) : null,
    jobs: [...jobs.values()].sort((a, b) => a.job.localeCompare(b.job) || a.source.localeCompare(b.source)),
    failures: rows
      .filter((r) => r.status === "failed")
      .slice(0, 8)
      .map((r) => ({ job: r.job, source: r.source, at: r.started_at, error: r.error })),
  };
});

export interface TicketQueue {
  open: number;
  pending: number;
  closed7d: number;
  oldestOpenH: number | null;
  queue: { id: string; subject: string; status: string; email: string | null; ageH: number; updatedAt: string }[];
}

export const ticketQueue = cache(async (): Promise<TicketQueue> => {
  const admin = supabaseAdmin();
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const [live, closed] = await Promise.all([
    admin
      .from("support_tickets")
      .select("id, subject, status, created_at, updated_at, guest_email, profiles(email)")
      .in("status", ["open", "pending"])
      .order("created_at", { ascending: true })
      .limit(200),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "closed").gte("updated_at", weekAgo),
  ]);
  const rows = live.data ?? [];
  const open = rows.filter((t) => t.status === "open");
  return {
    open: open.length,
    pending: rows.filter((t) => t.status === "pending").length,
    closed7d: closed.count ?? 0,
    oldestOpenH: open.length ? hoursBetween(open[0].created_at) : null,
    queue: rows.slice(0, 10).map((t) => {
      const prof = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        email: (prof as { email: string | null } | null)?.email ?? t.guest_email ?? null,
        ageH: hoursBetween(t.created_at),
        updatedAt: t.updated_at,
      };
    }),
  };
});

export interface FeedbackSummary {
  count30d: number;
  average30d: number | null;
  latest: { score: number | null; comment: string | null; page: string | null; at: string; email: string | null }[];
}

export const feedbackSummary = cache(async (): Promise<FeedbackSummary> => {
  const since = new Date(Date.now() - WINDOW * DAY).toISOString();
  const { data } = await supabaseAdmin()
    .from("feedback")
    .select("score, comment, page_path, created_at, profiles(email)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const recent = rows.filter((r) => r.created_at >= since);
  const scored = recent.filter((r) => typeof r.score === "number");
  return {
    count30d: recent.length,
    average30d: scored.length ? scored.reduce((s, r) => s + (r.score as number), 0) / scored.length : null,
    latest: rows.slice(0, 6).map((r) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        score: r.score as number | null,
        comment: r.comment as string | null,
        page: r.page_path as string | null,
        at: r.created_at as string,
        email: (prof as { email: string | null } | null)?.email ?? null,
      };
    }),
  };
});

/* ---------------------------------------------------------------- the owner */

export interface OwnerDashboard {
  revenue30d: number;
  revenuePrev30d: number;
  revenueSeries: DayPoint[];
  revenueByPlan: { label: string; value: number }[];
  /** Payments in a currency other than naira, counted not summed (no FX here). */
  foreignPayments30d: number;
  payingNow: number;
  registered: number;
  signups30d: number;
  signupsPrev30d: number;
  signupSeries: DayPoint[];
  active7d: number;
  active30d: number;
  checkout: { started: number; paid: number; failed: number; pending: number };
  tierMix: { free: number; pass: number; pro: number; vip: number };
  picks30d: PickStats;
  picksPrev30d: PickStats;
  latestPayments: { id: string; email: string | null; plan: string; amount: string; status: string; at: string }[];
  audit: { id: string; email: string; action: string; target: string | null; at: string }[];
  tickets: TicketQueue;
  ingest: IngestSummary;
  hub: HubCodeCheck[];
}

export async function ownerDashboard(now = Date.now()): Promise<OwnerDashboard> {
  const admin = supabaseAdmin();
  const cur = now - WINDOW * DAY;
  const prev = now - 2 * WINDOW * DAY;
  const [payments, profiles, picks, payingIds, subs, audit, tickets, ingest, hub] = await Promise.all([
    recentPayments(),
    allProfiles(),
    recentPicks(),
    paying(),
    admin.from("subscriptions").select("user_id, tier, status, current_period_end, pass_expires_at"),
    admin.from("admin_audit_log").select("id, admin_email, action, target, created_at").order("created_at", { ascending: false }).limit(8),
    ticketQueue(),
    ingestSummary(),
    hubToday(),
  ]);

  const success = payments.filter(isSuccess);
  const inWindow = (p: PaymentRow) => Date.parse(p.created_at) >= cur;
  const revenueByPlan = new Map<string, number>();
  for (const p of success.filter(inWindow)) revenueByPlan.set(planFamily(p.plan), (revenueByPlan.get(planFamily(p.plan)) ?? 0) + naira(p));

  const windowPayments = payments.filter(inWindow);
  const tierMix = { free: 0, pass: 0, pro: 0, vip: 0 };
  const liveTier = new Map<string, "pass" | "pro" | "vip">();
  for (const s of subs.data ?? []) {
    if (payingIds.has(s.user_id) && (s.tier === "pass" || s.tier === "pro" || s.tier === "vip")) liveTier.set(s.user_id, s.tier);
  }
  for (const t of liveTier.values()) tierMix[t]++;
  tierMix.free = Math.max(0, profiles.length - liveTier.size);

  return {
    revenue30d: sumBetween(success, (p) => p.created_at, cur, now + 1, naira),
    revenuePrev30d: sumBetween(success, (p) => p.created_at, prev, cur, naira),
    revenueSeries: byDay(success, (p) => p.created_at, naira, WINDOW, now),
    revenueByPlan: [...revenueByPlan.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    foreignPayments30d: success.filter((p) => inWindow(p) && p.currency && p.currency !== "NGN").length,
    payingNow: payingIds.size,
    registered: profiles.length,
    signups30d: sumBetween(profiles, (p) => p.created_at, cur, now + 1),
    signupsPrev30d: sumBetween(profiles, (p) => p.created_at, prev, cur),
    signupSeries: byDay(profiles, (p) => p.created_at, () => 1, WINDOW, now),
    active7d: profiles.filter((p) => p.last_seen_at && Date.parse(p.last_seen_at) >= now - 7 * DAY).length,
    active30d: profiles.filter((p) => p.last_seen_at && Date.parse(p.last_seen_at) >= cur).length,
    checkout: {
      started: windowPayments.length,
      paid: windowPayments.filter(isSuccess).length,
      failed: windowPayments.filter((p) => p.status === "failed").length,
      pending: windowPayments.filter((p) => p.status === "pending").length,
    },
    tierMix,
    picks30d: pickStats(picks, cur, now + 1),
    picksPrev30d: pickStats(picks, prev, cur),
    latestPayments: payments.slice(0, 7).map((p) => ({
      id: p.id,
      email: emailOf(p),
      plan: p.plan,
      amount: paymentAmount(p),
      status: p.status,
      at: p.created_at,
    })),
    audit: (audit.data ?? []).map((a) => ({ id: a.id, email: a.admin_email, action: a.action, target: a.target, at: a.created_at })),
    tickets,
    ingest,
    hub,
  };
}

/* -------------------------------------------------------------- the product */

export interface ProductDashboard {
  picks7d: PickStats;
  picksPrev7d: PickStats;
  picks30d: PickStats;
  strong30d: PickStats;
  picksSeries: DayPoint[];
  published7d: number;
  hub: HubCodeCheck[];
  ingest: IngestSummary;
  booking7d: { total: number; booked: number; problems: number; refused: number; cached: number };
  features14d: { label: string; value: number; sub: string }[];
  ask14d: { questions: number; askers: number };
  switches: { key: string; enabled: boolean }[];
  dataLayer: string;
  maintenance: boolean;
  feedback: FeedbackSummary;
  tickets: TicketQueue;
}

export async function productDashboard(now = Date.now()): Promise<ProductDashboard> {
  const admin = supabaseAdmin();
  const since14 = new Date(now - 14 * DAY).toISOString().slice(0, 10);
  const since7 = new Date(now - 7 * DAY).toISOString();
  const [picks, hub, ingest, booking, features, ask, switches, settings, feedback, tickets] = await Promise.all([
    recentPicks(),
    hubToday(),
    ingestSummary(),
    admin.from("sportybet_booking_log").select("outcome").gte("at", since7).limit(5000),
    admin.from("feature_usage").select("feature, user_id, uses").gte("day", since14).limit(10_000),
    admin.from("ask_usage").select("user_id, questions").gte("day", since14).limit(10_000),
    admin.from("app_switches").select("key, enabled").order("key"),
    admin.from("site_settings").select("data_layer, maintenance_enabled").maybeSingle(),
    feedbackSummary(),
    ticketQueue(),
  ]);

  const featureMap = new Map<string, { uses: number; users: Set<string> }>();
  for (const f of features.data ?? []) {
    const e = featureMap.get(f.feature) ?? { uses: 0, users: new Set<string>() };
    e.uses += Number(f.uses) || 0;
    if (f.user_id) e.users.add(f.user_id);
    featureMap.set(f.feature, e);
  }
  const outcomes = (booking.data ?? []).map((b) => b.outcome as string);
  const askRows = ask.data ?? [];

  return {
    picks7d: pickStats(picks, now - 7 * DAY, now + 1),
    picksPrev7d: pickStats(picks, now - 14 * DAY, now - 7 * DAY),
    picks30d: pickStats(picks, now - WINDOW * DAY, now + 1),
    strong30d: pickStats(picks, now - WINDOW * DAY, now + 1, true),
    picksSeries: dailyHitRate(picks, now),
    published7d: picks.filter((p) => Date.parse(p.kickoff) >= now - 7 * DAY && Date.parse(p.kickoff) < now).length,
    hub,
    ingest,
    booking7d: {
      total: outcomes.length,
      booked: outcomes.filter((o) => o === "booked").length,
      problems: outcomes.filter((o) => o === "problems").length,
      refused: outcomes.filter((o) => o === "refused").length,
      cached: outcomes.filter((o) => o === "cached").length,
    },
    features14d: [...featureMap.entries()]
      .map(([label, e]) => ({ label, value: e.uses, sub: `${e.users.size} ${e.users.size === 1 ? "user" : "users"}` }))
      .sort((a, b) => b.value - a.value),
    ask14d: { questions: askRows.reduce((s, r) => s + (Number(r.questions) || 0), 0), askers: new Set(askRows.map((r) => r.user_id)).size },
    switches: (switches.data ?? []).map((s) => ({ key: s.key as string, enabled: Boolean(s.enabled) })),
    dataLayer: (settings.data?.data_layer as string | undefined) ?? "live",
    maintenance: Boolean(settings.data?.maintenance_enabled),
    feedback,
    tickets,
  };
}

/* ------------------------------------------------------------- the marketer */

export interface MarketingDashboard {
  signups30d: number;
  signupsPrev30d: number;
  signups7d: number;
  signupSeries: DayPoint[];
  newPayers30d: number;
  newPayersPrev30d: number;
  /** Signups in the window who have paid at least once. */
  cohortConversion: number | null;
  channels: { label: string; value: number; sub: string }[];
  campaigns: { label: string; value: number; sub: string }[];
  landings: { label: string; value: number }[];
  partners: { name: string; slug: string; signups30d: number; signupsAll: number; status: string }[];
  emails: { campaign: string; sent: number; pending: number; failed: number }[];
  audience: { registered: number; reachable: number; push: number; waitlist: number; vip: number; optOut: number };
}

export async function marketingDashboard(now = Date.now()): Promise<MarketingDashboard> {
  const admin = supabaseAdmin();
  const cur = now - WINDOW * DAY;
  const prev = now - 2 * WINDOW * DAY;
  const [profiles, partners, emails, push, waitlist, vip, everPaid] = await Promise.all([
    allProfiles(),
    admin.from("partners").select("id, name, slug, status"),
    admin.from("email_campaign_recipients").select("campaign, status").limit(20_000),
    admin.from("push_subscriptions").select("*", { count: "exact", head: true }),
    admin.from("code_hub_waitlist").select("*", { count: "exact", head: true }),
    admin.from("vip_chat_members").select("*", { count: "exact", head: true }).is("removed_at", null),
    admin.from("payments").select("user_id, created_at").eq("status", "success").limit(10_000),
  ]);

  // First successful payment per user: the day they became a customer.
  const firstPaid = new Map<string, number>();
  for (const p of everPaid.data ?? []) {
    if (!p.user_id) continue;
    const t = Date.parse(p.created_at);
    if (!firstPaid.has(p.user_id) || t < (firstPaid.get(p.user_id) ?? Infinity)) firstPaid.set(p.user_id, t);
  }
  const firsts = [...firstPaid.values()];
  const cohort = profiles.filter((p) => Date.parse(p.created_at) >= cur);
  const paid = (p: SignupRow) => firstPaid.has(p.id);

  const byChannel = new Map<string, { n: number; paid: number }>();
  for (const p of cohort) {
    const c = channelOf(p);
    const e = byChannel.get(c) ?? { n: 0, paid: 0 };
    e.n++;
    if (paid(p)) e.paid++;
    byChannel.set(c, e);
  }

  // Campaigns over 90 days: tagged links take time to pay off.
  const tagged = profiles.filter((p) => p.signup_utm_campaign && Date.parse(p.created_at) >= now - 90 * DAY);
  const byCampaign = new Map<string, { n: number; paid: number }>();
  for (const p of tagged) {
    const k = `${p.signup_utm_campaign}`;
    const e = byCampaign.get(k) ?? { n: 0, paid: 0 };
    e.n++;
    if (paid(p)) e.paid++;
    byCampaign.set(k, e);
  }

  const partnerSignups = (id: string, from = 0) =>
    profiles.filter((p) => p.referred_by_partner === id && Date.parse(p.created_at) >= from).length;

  const emailMap = new Map<string, { sent: number; pending: number; failed: number }>();
  for (const e of emails.data ?? []) {
    const m = emailMap.get(e.campaign) ?? { sent: 0, pending: 0, failed: 0 };
    if (e.status === "sent") m.sent++;
    else if (e.status === "pending") m.pending++;
    else m.failed++;
    emailMap.set(e.campaign, m);
  }

  const conv = (e: { n: number; paid: number }) => `${e.paid} paid · ${e.n ? Math.round((e.paid / e.n) * 100) : 0}%`;

  return {
    signups30d: cohort.length,
    signupsPrev30d: sumBetween(profiles, (p) => p.created_at, prev, cur),
    signups7d: sumBetween(profiles, (p) => p.created_at, now - 7 * DAY, now + 1),
    signupSeries: byDay(profiles, (p) => p.created_at, () => 1, WINDOW, now),
    newPayers30d: firsts.filter((t) => t >= cur).length,
    newPayersPrev30d: firsts.filter((t) => t >= prev && t < cur).length,
    cohortConversion: cohort.length ? cohort.filter(paid).length / cohort.length : null,
    channels: [...byChannel.entries()]
      .map(([label, e]) => ({ label, value: e.n, sub: conv(e) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    campaigns: [...byCampaign.entries()]
      .map(([label, e]) => ({ label, value: e.n, sub: conv(e) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    landings: rank(cohort.filter((p) => p.signup_landing_page), (p) => p.signup_landing_page as string, 6),
    partners: (partners.data ?? [])
      .map((p) => ({
        name: p.name as string,
        slug: p.slug as string,
        status: p.status as string,
        signups30d: partnerSignups(p.id as string, cur),
        signupsAll: partnerSignups(p.id as string),
      }))
      .sort((a, b) => b.signups30d - a.signups30d || b.signupsAll - a.signupsAll)
      .slice(0, 6),
    emails: [...emailMap.entries()]
      .map(([campaign, m]) => ({ campaign, ...m }))
      .sort((a, b) => b.sent + b.pending - (a.sent + a.pending)),
    audience: {
      registered: profiles.length,
      reachable: profiles.filter((p) => !p.marketing_opt_out && p.email).length,
      push: push.count ?? 0,
      waitlist: waitlist.count ?? 0,
      vip: vip.count ?? 0,
      optOut: profiles.filter((p) => p.marketing_opt_out).length,
    },
  };
}

/* --------------------------------------------------------------- the support */

export interface SupportDashboard {
  tickets: TicketQueue;
  feedback: FeedbackSummary;
  /** People whose checkout failed in the last 7 days and who have not paid since: worth a hand. */
  stuckCheckouts: { email: string | null; plan: string; at: string; attempts: number }[];
  gifts: { email: string | null; tier: string; expires: string; by: string | null }[];
  newUsers7d: number;
}

export async function supportDashboard(now = Date.now()): Promise<SupportDashboard> {
  const admin = supabaseAdmin();
  const [tickets, feedback, payments, gifts, profiles] = await Promise.all([
    ticketQueue(),
    feedbackSummary(),
    recentPayments(),
    admin
      .from("subscription_gifts")
      .select("tier, expires_at, granted_by_email, profiles(email)")
      .gt("expires_at", new Date(now).toISOString())
      .order("expires_at", { ascending: true })
      .limit(8),
    allProfiles(),
  ]);

  const weekAgo = now - 7 * DAY;
  const paidSince = new Map<string, number>();
  for (const p of payments) if (p.user_id && isSuccess(p)) paidSince.set(p.user_id, Math.max(paidSince.get(p.user_id) ?? 0, Date.parse(p.created_at)));
  const stuck = new Map<string, { email: string | null; plan: string; at: string; attempts: number }>();
  for (const p of payments) {
    if (!p.user_id || p.status !== "failed" || Date.parse(p.created_at) < weekAgo) continue;
    if ((paidSince.get(p.user_id) ?? 0) > Date.parse(p.created_at)) continue;
    const e = stuck.get(p.user_id);
    if (e) e.attempts++;
    else stuck.set(p.user_id, { email: emailOf(p), plan: p.plan, at: p.created_at, attempts: 1 });
  }

  return {
    tickets,
    feedback,
    stuckCheckouts: [...stuck.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
    gifts: (gifts.data ?? []).map((g) => {
      const prof = Array.isArray(g.profiles) ? g.profiles[0] : g.profiles;
      return {
        email: (prof as { email: string | null } | null)?.email ?? null,
        tier: g.tier as string,
        expires: g.expires_at as string,
        by: g.granted_by_email as string | null,
      };
    }),
    newUsers7d: sumBetween(profiles, (p) => p.created_at, weekAgo, now + 1),
  };
}

export { change, HUB_MIN_TARGET_SHARE };
