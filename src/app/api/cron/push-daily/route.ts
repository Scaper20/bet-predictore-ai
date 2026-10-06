import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { todaysQualifyingPicks } from "@/lib/whatsapp-digest-feed";
import { dailyPayload } from "@/lib/push/messages";
import { pushConfigured, sendPushBatch, summarise } from "@/lib/push/send";
import { loadPaidUserIds, loadSubscriptions, recordOutcome, yesterdayRecord } from "@/lib/push/store";
import { freeStrongPickId } from "@/lib/service";
import { pickVisible } from "@/lib/access";
import type { Pick } from "@/lib/model/predict";

// Same posture as the other crons: Node-only (service-role client, web-push),
// and CRON_SECRET is required because this reaches every subscriber.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The morning notification: today's picks and how yesterday's went.
 *
 * Runs at 07:00 UTC (08:00 in Lagos) — after settle-predictions has graded
 * the night's matches, and before the early kickoffs. Hobby crons can fire
 * any time inside the scheduled hour, which is fine for a morning message.
 *
 * The picks are the same selection as the WhatsApp digest (odds of 1.40 or
 * longer, enough history), so the notification and the community post never
 * disagree. Each device gets the version its topics ask for; a device that
 * wants only picks gets nothing on a day without any.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!pushConfigured) {
    return NextResponse.json({ skipped: "VAPID keys are not configured" });
  }

  const admin = supabaseAdmin();
  const now = new Date();
  const [picks, record, devices] = await Promise.all([
    todaysQualifyingPicks(now).catch(() => []),
    yesterdayRecord(admin, now),
    loadSubscriptions(admin, { daily: true }),
  ]);

  // The same plan line as the site (lib/access.ts): a free device is told
  // only about picks a free viewer can see.
  const [paid, freeStrongId] = await Promise.all([
    loadPaidUserIds(admin, [...new Set(devices.map((d) => d.userId).filter((x): x is string => Boolean(x)))]),
    freeStrongPickId(),
  ]);
  const freeViewer = { paid: false, freeStrongId };
  const freePicks = picks.filter((p) => pickVisible(p as unknown as Pick, p.id, freeViewer));

  const items = devices.flatMap((d) => {
    const isPaid = d.userId !== null && paid.has(d.userId);
    const payload = dailyPayload({ picks: isPaid ? picks : freePicks, record, topics: d });
    return payload ? [{ id: d.id, target: d, payload }] : [];
  });

  // Twelve hours: a phone that was off overnight still hears about today's
  // picks when it comes back, but never about yesterday's.
  const result = await sendPushBatch(items, { ttl: 12 * 3600, topic: "daily" });
  await recordOutcome(admin, result);

  return NextResponse.json({
    picks: picks.length,
    record,
    devices: devices.length,
    ...summarise(result),
  });
}
