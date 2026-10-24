import { NextResponse } from "next/server";
import { paidUserIds } from "@/lib/paid-users";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { strongKickoffPayload, strongResultPayload, type PushPayload, type StrongPickEvent } from "@/lib/push/messages";
import { pushConfigured, sendPushBatch, summarise } from "@/lib/push/send";
import { loadSubscriptions, recordOutcome } from "@/lib/push/store";
import { dispatchCommunity, dispatchHubCodes, dispatchSlips } from "@/lib/push/events";

export const runtime = "nodejs";
export const maxDuration = 120;

/** How far ahead of kickoff the "kicks off soon" alert goes. */
const KICKOFF_LEAD_MS = 20 * 60_000;
/** How long after grading a result is still worth sending. */
const RESULT_WINDOW_MS = 3 * 3_600_000;

/**
 * Everything that should reach a phone within a minute or two of happening:
 * Strong pick alerts (one shortly before kickoff, one when graded), today's
 * Code Hub codes, community codes, and the results of tracked slips.
 *
 * Called every minute by pg_cron (0074_push_events_every_minute.sql), which
 * only makes the call when its checks find something waiting: Vercel's Hobby
 * crons run once a day, far too seldom for this. Each event is sent once:
 * push_events_sent holds its key, and a slip is claimed by an update that
 * only one run can win. The Code Hub codes and community posts are also sent
 * the moment they are made (code-hub-feed.ts, code-hub-posts.ts); this run
 * catches whatever that missed.
 *
 * The Strong pick alerts are a Pro feature: only devices signed in to a paid
 * account hear them (lib/pricing.ts). The rest are for everyone.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured) return NextResponse.json({ skipped: "VAPID keys are not configured" });

  // Independent of each other: one failing never holds back the rest.
  const [strong, codes, community, slips] = await Promise.allSettled([
    strongPickAlerts(),
    dispatchHubCodes(),
    dispatchCommunity(),
    dispatchSlips(),
  ]);
  const out = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: String(r.reason).slice(0, 200) });
  return NextResponse.json({ strong: out(strong), codes: out(codes), community: out(community), slips: out(slips) });
}

async function strongPickAlerts() {
  const admin = supabaseAdmin();
  const now = Date.now();
  const cols = "match_id, league_code, home_name, away_name, label, probability, kickoff, result, actual_home_goals, actual_away_goals, settled_at";

  const [{ data: soon }, { data: graded }] = await Promise.all([
    admin
      .from("predictions_log")
      .select(cols)
      .eq("pick_tier", "strong")
      .gt("kickoff", new Date(now).toISOString())
      .lte("kickoff", new Date(now + KICKOFF_LEAD_MS).toISOString()),
    admin
      .from("predictions_log")
      .select(cols)
      .eq("pick_tier", "strong")
      .in("result", ["win", "lose"])
      .gte("settled_at", new Date(now - RESULT_WINDOW_MS).toISOString()),
  ]);

  type Row = {
    match_id: string; league_code: string | null; home_name: string; away_name: string; label: string; probability: number; kickoff: string;
    result: "win" | "lose" | "push" | null; actual_home_goals: number | null; actual_away_goals: number | null;
  };
  const toEvent = (r: Row): StrongPickEvent => ({
    matchId: r.match_id, home: r.home_name, away: r.away_name, label: r.label, probability: r.probability,
    kickoff: r.kickoff, result: r.result, score: { home: r.actual_home_goals, away: r.actual_away_goals },
  });

  const events: { key: string; topic: "picks" | "results"; event: StrongPickEvent; payload: PushPayload }[] = [];
  for (const r of (soon ?? []) as Row[]) {
    const e = toEvent(r);
    events.push({ key: `kickoff:${r.match_id}`, topic: "picks", event: e, payload: strongKickoffPayload(e) });
  }
  for (const r of (graded ?? []) as Row[]) {
    const e = toEvent(r);
    const payload = strongResultPayload(e);
    if (payload) events.push({ key: `result:${r.match_id}`, topic: "results", event: e, payload });
  }
  if (events.length === 0) return { events: 0 };

  // Claim the keys first: a second run five minutes later, or an overlapping
  // one, skips anything already claimed instead of sending it twice.
  const { data: claimed } = await admin
    .from("push_events_sent")
    .upsert(events.map((e) => ({ key: e.key })), { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  const fresh = new Set((claimed ?? []).map((r) => r.key as string));
  const todo = events.filter((e) => fresh.has(e.key));
  if (todo.length === 0) return { events: events.length, sent: 0, note: "already sent" };

  const [devices, paidUsers] = await Promise.all([loadSubscriptions(admin), paidUserIds(admin)]);

  const items = todo.flatMap((t) =>
    devices
      .filter((d) => (t.topic === "picks" ? d.picks : d.results))
      .filter((d) => d.userId !== null && paidUsers.has(d.userId))
      .map((d) => ({ id: d.id, target: d, payload: t.payload })),
  );

  // Kickoff alerts are useless late, so a short TTL; results can wait an hour.
  const result = await sendPushBatch(items, { ttl: 3600, urgency: "high" });
  await recordOutcome(admin, result);

  return { events: todo.length, devices: devices.length, ...summarise(result) };
}
