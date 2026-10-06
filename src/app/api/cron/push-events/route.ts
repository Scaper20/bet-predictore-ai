import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { freeStrongPickId } from "@/lib/service";
import { strongKickoffPayload, strongResultPayload, type PushPayload, type StrongPickEvent } from "@/lib/push/messages";
import { pushConfigured, sendPushBatch, summarise } from "@/lib/push/send";
import { loadPaidUserIds, loadSubscriptions, recordOutcome, type StoredSubscription } from "@/lib/push/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** How far ahead of kickoff the "kicks off soon" alert goes. */
const KICKOFF_LEAD_MS = 20 * 60_000;
/** How long after grading a result is still worth sending. */
const RESULT_WINDOW_MS = 3 * 3_600_000;

/**
 * Match-time notifications for Strong picks: one shortly before kickoff and
 * one when it is graded, won or lost.
 *
 * Called every five minutes by pg_cron (0042_push_events.sql), which only
 * makes the call when a Strong pick is about to start or was just graded —
 * Vercel's Hobby crons run once a day, too seldom for this. Each event is
 * sent once: push_events_sent holds its key.
 *
 * Follows the plan line (lib/access.ts): a device signed in to a paid plan
 * hears about every Strong pick; any other device only about today's free
 * one, the same single Strong pick free viewers see on the site.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured) return NextResponse.json({ skipped: "VAPID keys are not configured" });

  const admin = supabaseAdmin();
  const now = Date.now();
  const cols = "match_id, home_name, away_name, label, probability, kickoff, result, actual_home_goals, actual_away_goals, settled_at";

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
    match_id: string; home_name: string; away_name: string; label: string; probability: number; kickoff: string;
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
  if (events.length === 0) return NextResponse.json({ events: 0 });

  // Claim the keys first: a second run five minutes later, or an overlapping
  // one, skips anything already claimed instead of sending it twice.
  const { data: claimed } = await admin
    .from("push_events_sent")
    .upsert(events.map((e) => ({ key: e.key })), { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  const fresh = new Set((claimed ?? []).map((r) => r.key as string));
  const todo = events.filter((e) => fresh.has(e.key));
  if (todo.length === 0) return NextResponse.json({ events: events.length, sent: 0, note: "already sent" });

  const [devices, freeStrongId] = await Promise.all([loadSubscriptions(admin, { daily: true }), freeStrongPickId()]);
  const paid = await loadPaidUserIds(
    admin,
    [...new Set(devices.map((d) => d.userId).filter((x): x is string => Boolean(x)))],
  );
  const canHear = (d: StoredSubscription, e: StrongPickEvent) =>
    (d.userId !== null && paid.has(d.userId)) || e.matchId === freeStrongId;

  const items = todo.flatMap((t) =>
    devices
      .filter((d) => (t.topic === "picks" ? d.picks : d.results) && canHear(d, t.event))
      .map((d) => ({ id: d.id, target: d, payload: t.payload })),
  );

  // Kickoff alerts are useless late, so a short TTL; results can wait an hour.
  const result = await sendPushBatch(items, { ttl: 3600, urgency: "high" });
  await recordOutcome(admin, result);

  return NextResponse.json({ events: todo.length, devices: devices.length, ...summarise(result) });
}
