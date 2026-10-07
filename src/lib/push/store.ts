import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchResult, PushTarget } from "@/lib/push/send";
import type { DayRecord } from "@/lib/push/messages";
import { appDayBounds } from "@/lib/format";
import { DEFAULT_SPORT } from "@/lib/sports";

/**
 * Service-role reads and writes on push_subscriptions, for the crons only.
 * Browsers never come through here: they manage their own row through the
 * push_* database functions (0024_push_subscriptions.sql).
 */

export interface StoredSubscription extends PushTarget {
  id: string;
  userId: string | null;
  picks: boolean;
  results: boolean;
  valueAlerts: boolean;
}

const COLUMNS = "id, endpoint, p256dh, auth, user_id, picks, results, value_alerts";
/** PostgREST returns at most this many rows a request by default. */
const PAGE = 1000;
/** Ids per update/delete: they travel in the URL. */
const ID_CHUNK = 200;

/**
 * Subscriptions for one kind of send, a page at a time:
 *  - `daily`: devices that want the morning picks or results;
 *  - `valueAlertsFor`: devices signed in to one of these (VIP) accounts that
 *    have the alerts on.
 */
export async function loadSubscriptions(
  admin: SupabaseClient,
  where: { daily: true } | { valueAlertsFor: string[] },
): Promise<StoredSubscription[]> {
  if ("valueAlertsFor" in where && where.valueAlertsFor.length === 0) return [];
  const out: StoredSubscription[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = admin.from("push_subscriptions").select(COLUMNS);
    query =
      "daily" in where
        ? query.or("picks.eq.true,results.eq.true")
        : query.eq("value_alerts", true).in("user_id", where.valueAlertsFor);
    const { data, error } = await query.order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      out.push({
        id: r.id,
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
        userId: r.user_id,
        picks: r.picks,
        results: r.results,
        valueAlerts: r.value_alerts,
      });
    }
    if (!data || data.length < PAGE) return out;
  }
}

/** Stamps the devices reached and deletes the ones that are gone. */
export async function recordOutcome(admin: SupabaseClient, result: BatchResult): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < result.sent.length; i += ID_CHUNK) {
    await admin
      .from("push_subscriptions")
      .update({ last_sent_at: now })
      .in("id", result.sent.slice(i, i + ID_CHUNK));
  }
  for (let i = 0; i < result.gone.length; i += ID_CHUNK) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in("id", result.gone.slice(i, i + ID_CHUNK));
  }
  // One write per failed device: rare, and the reason differs per device.
  // Best effort: before 0042 the columns don't exist and this is a no-op.
  for (const [id, reason] of Object.entries(result.errors ?? {})) {
    await admin.from("push_subscriptions").update({ last_error: reason, last_error_at: now }).eq("id", id);
  }
}

/**
 * Yesterday's settled headline picks — the same rows the public track record
 * counts. Matches still unsettled at send time are left out rather than
 * guessed at; voided ones are not wins or losses.
 */
export async function yesterdayRecord(admin: SupabaseClient, now = new Date()): Promise<DayRecord | null> {
  const { start, end } = appDayBounds(now, -1);
  const { data, error } = await admin
    .from("predictions_log")
    .select("result")
    .eq("sport", DEFAULT_SPORT)
    .gte("kickoff", start.toISOString())
    .lt("kickoff", end.toISOString())
    .in("result", ["win", "lose"])
    .limit(5000);
  if (error || !data) return null;
  const won = data.filter((r) => r.result === "win").length;
  const lost = data.length - won;
  return won + lost > 0 ? { won, lost } : null;
}
