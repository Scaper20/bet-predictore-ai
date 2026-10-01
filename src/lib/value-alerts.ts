import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { priceSelections } from "@/lib/odds";
import { ALERT_MARKETS, valueHit, type ScanInfo } from "@/lib/value-alert-rules";

/**
 * Value-shift alerts (VIP).
 *
 * A scan prices every publishable fixture in the next two days on the
 * markets both price sources carry, and records each selection where
 * SportyBet's price has moved above fair value (see value-alert-rules.ts for
 * exactly when). A selection that was not flagged on the previous scan and is
 * now is a *shift* — that is what gets emailed.
 *
 * Two things run a scan:
 *  - the daily cron, which also sends the email digest, and
 *  - the VIP page itself, in the background, whenever the newest scan is
 *    older than STALE_AFTER_MS. That keeps the page fresh through the day
 *    without a frequent cron (Vercel Hobby allows one run a day).
 *
 * Cost is bounded by the providers, not by how often this runs: both price
 * sources are fetched a competition at a time behind a TTL cache, and The
 * Odds API spend is guarded by its own quota reserve (odds/budget.ts).
 */

const WINDOW_DAYS = 2;
const MAX_FIXTURES = 40;

export interface ValueAlert {
  matchId: string;
  market: string;
  label: string;
  leagueCode: string | null;
  leagueName: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  probability: number;
  localPrice: number;
  benchmark: "market" | "model";
  edge: number;
  reason: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

const COLUMNS =
  "match_id, market, label, league_code, league_name, home_name, away_name, kickoff, probability, " +
  "local_price, benchmark, edge, reason, first_seen_at, last_seen_at";

function fromRow(r: Record<string, unknown>): ValueAlert {
  return {
    matchId: r.match_id as string,
    market: r.market as string,
    label: r.label as string,
    leagueCode: (r.league_code as string | null) ?? null,
    leagueName: r.league_name as string,
    homeName: r.home_name as string,
    awayName: r.away_name as string,
    kickoff: r.kickoff as string,
    probability: r.probability as number,
    localPrice: r.local_price as number,
    benchmark: r.benchmark as "market" | "model",
    edge: r.edge as number,
    reason: r.reason as string,
    firstSeenAt: r.first_seen_at as string,
    lastSeenAt: r.last_seen_at as string,
  };
}

export interface ScanResult {
  fixtures: number;
  found: number;
  fresh: number;
}

export async function runValueScan(trigger: "cron" | "page"): Promise<ScanResult> {
  const admin = supabaseAdmin();
  const startedAt = new Date();
  const { data: scan } = await admin
    .from("value_alert_scans")
    .insert({ trigger, started_at: startedAt.toISOString() })
    .select("id")
    .single();

  const feed = await upcomingFeed(WINDOW_DAYS).catch(() => null);
  const now = Date.now();
  const candidates = (feed?.matches ?? []).filter(
    (m) => m.league.code && m.status === "scheduled" && Date.parse(m.kickoff) > now,
  );
  const predictions = (await predictBatch(candidates, MAX_FIXTURES).catch(() => [])).filter(
    (p) => p.sufficiency.publishable,
  );

  const wanted = new Set<string>(ALERT_MARKETS);
  const rows: Record<string, unknown>[] = [];
  for (const p of predictions) {
    const picks = p.picks.filter((pick) => wanted.has(pick.market));
    const priced = await priceSelections(p.match, picks).catch(() => []);
    for (const s of priced) {
      const hit = valueHit(s);
      if (!hit) continue;
      rows.push({
        match_id: p.match.id,
        market: s.market,
        label: s.label,
        league_code: p.match.league.code ?? null,
        league_name: p.match.league.name,
        home_name: p.match.home.name,
        away_name: p.match.away.name,
        kickoff: p.match.kickoff,
        probability: s.probability,
        local_price: hit.price,
        benchmark: hit.benchmark,
        edge: hit.edge,
        reason: hit.reason,
        active: true,
        last_seen_at: startedAt.toISOString(),
      });
    }
  }

  // Which of these were not already live? Those are the shifts.
  let fresh = 0;
  if (rows.length > 0) {
    const { data: existing } = await admin
      .from("value_alerts")
      .select("match_id, market, active")
      .in("match_id", [...new Set(rows.map((r) => r.match_id as string))]);
    const live = new Set(
      (existing ?? []).filter((e) => e.active).map((e) => `${e.match_id}|${e.market}`),
    );
    for (const r of rows) {
      if (!live.has(`${r.match_id}|${r.market}`)) {
        // A new or returning alert: restart its clock and make it notifiable.
        r.first_seen_at = startedAt.toISOString();
        r.notified_at = null;
        fresh++;
      }
    }
    await admin.from("value_alerts").upsert(rows, { onConflict: "match_id,market" });
  }

  // Anything live that this scan did not see again has gone: the price moved
  // back, or the match kicked off.
  await admin
    .from("value_alerts")
    .update({ active: false })
    .eq("active", true)
    .lt("last_seen_at", startedAt.toISOString());

  if (scan) {
    await admin
      .from("value_alert_scans")
      .update({ finished_at: new Date().toISOString(), fixtures: predictions.length, found: rows.length })
      .eq("id", scan.id);
  }

  return { fixtures: predictions.length, found: rows.length, fresh };
}

export async function activeAlerts(): Promise<ValueAlert[]> {
  const { data } = await supabaseAdmin()
    .from("value_alerts")
    .select(COLUMNS)
    .eq("active", true)
    .gt("kickoff", new Date().toISOString())
    .order("edge", { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(fromRow);
}

export async function latestScan(): Promise<ScanInfo | null> {
  const { data } = await supabaseAdmin()
    .from("value_alert_scans")
    .select("started_at, finished_at, fixtures")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { startedAt: data.started_at, finishedAt: data.finished_at, fixtures: data.fixtures } : null;
}

/**
 * Everyone with VIP right now — paid or gifted — who has not switched the
 * alert email off.
 */
export async function vipAlertRecipients(): Promise<{ userId: string; email: string }[]> {
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const [{ data: subs }, { data: gifts }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("user_id, status, current_period_end")
      .eq("tier", "vip")
      .neq("status", "none"),
    admin.from("subscription_gifts").select("user_id").eq("tier", "vip").gt("expires_at", nowIso),
  ]);

  const ids = new Set<string>();
  for (const s of subs ?? []) {
    // Same rule as resolveSubscriptionTier in entitlements.ts.
    const paidThrough = s.current_period_end
      ? Date.parse(s.current_period_end) > Date.now()
      : s.status === "active";
    if (paidThrough) ids.add(s.user_id);
  }
  for (const g of gifts ?? []) ids.add(g.user_id);
  if (ids.size === 0) return [];

  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    admin.from("profiles").select("id, email").in("id", [...ids]),
    admin.from("user_preferences").select("user_id, value_alerts_email").in("user_id", [...ids]),
  ]);
  const optedOut = new Set((prefs ?? []).filter((p) => p.value_alerts_email === false).map((p) => p.user_id));

  return (profiles ?? [])
    .filter((p) => p.email && !optedOut.has(p.id))
    .map((p) => ({ userId: p.id as string, email: p.email as string }));
}

/** Live alerts no one has been emailed about yet. */
export async function unnotifiedAlerts(): Promise<ValueAlert[]> {
  const { data } = await supabaseAdmin()
    .from("value_alerts")
    .select(COLUMNS)
    .eq("active", true)
    .is("notified_at", null)
    .gt("kickoff", new Date().toISOString())
    .order("edge", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(fromRow);
}

export async function markNotified(alerts: ValueAlert[]): Promise<void> {
  const admin = supabaseAdmin();
  const at = new Date().toISOString();
  await Promise.all(
    alerts.map((a) =>
      admin.from("value_alerts").update({ notified_at: at }).eq("match_id", a.matchId).eq("market", a.market),
    ),
  );
}
