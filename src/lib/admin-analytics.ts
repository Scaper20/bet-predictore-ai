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
  revenueThisMonthKobo: number;
  revenueTrend: { day: string; kobo: number }[]; // last 30 days, oldest first
  tierBreakdown: Record<"free" | "pass" | "pro" | "vip", number>;
  passSalesCount: number;
  settledPicks: { wins: number; losses: number; pushes: number; winRate: number | null };
  openTicketCount: number;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const admin = supabaseAdmin();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const cutoff7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const cutoff30d = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [
    registeredUsers,
    activeUsers7d,
    activeUsers30d,
    monthPayments,
    trendPayments,
    subscriptions,
    passSales,
    wins,
    losses,
    pushes,
    openTicketCount,
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", cutoff7d),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", cutoff30d),
    admin.from("payments").select("amount_kobo").eq("status", "success").gte("created_at", startOfMonth),
    admin.from("payments").select("amount_kobo, created_at").eq("status", "success").gte("created_at", cutoff30d),
    admin.from("subscriptions").select("tier").in("status", ["active", "past_due"]),
    // Checkout writes plan as `${tier}:${cycle}` (src/app/api/billing/checkout/route.ts)
    // — Pass is always "pass:monthly" even though it's a one-off, not a plain "pass".
    admin.from("payments").select("*", { count: "exact", head: true }).eq("status", "success").like("plan", "pass:%"),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "win"),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "lose"),
    admin.from("predictions_log").select("*", { count: "exact", head: true }).eq("result", "push"),
    admin.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const revenueThisMonthKobo = (monthPayments.data ?? []).reduce((sum, p) => sum + (p.amount_kobo as number), 0);

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
    revenueThisMonthKobo,
    revenueTrend,
    tierBreakdown,
    passSalesCount: passSales.count ?? 0,
    settledPicks: {
      wins: winCount,
      losses: loseCount,
      pushes: pushCount,
      winRate: graded > 0 ? winCount / graded : null,
    },
    openTicketCount: openTicketCount.count ?? 0,
  };
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
