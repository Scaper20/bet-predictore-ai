import { NextResponse } from "next/server";
import {
  runValueScan,
  unnotifiedAlerts,
  vipAlertRecipients,
  vipUserIds,
  markNotified,
  type ValueAlert,
} from "@/lib/value-alerts";
import { sendEmail } from "@/lib/email";
import { valueAlertsEmail } from "@/lib/email-templates";
import { SITE_URL } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushConfigured, sendPushBatch, summarise } from "@/lib/push/send";
import { loadSubscriptions, recordOutcome } from "@/lib/push/store";
import { valueAlertsPayload } from "@/lib/push/messages";

// Same posture as the other crons: Node-only (service-role client), and
// CRON_SECRET is required because this writes to the DB and sends email.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily value-shift scan and VIP email digest, before the day's kickoffs.
 *
 * The page rescans on its own through the day (see value-alerts.ts), so this
 * run's job is mainly the email: everything flagged since the last digest
 * that is still live goes out once, and is then marked so it never repeats.
 * The same set goes out as a push notification to VIPs' devices that have
 * notifications on.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const scan = await runValueScan("cron");
  const alerts = await unnotifiedAlerts();
  if (alerts.length === 0) return NextResponse.json({ scan, emailed: 0 });

  const vips = await vipUserIds();
  const pushed = await pushAlerts(vips, alerts).catch((err) => ({ error: String(err) }));

  const recipients = await vipAlertRecipients(vips);
  const email = valueAlertsEmail({ alerts, settingsUrl: `${SITE_URL}/account` });
  // One at a time, paced: Resend's default limit is 2 requests a second, and
  // sendEmail swallows a 429 rather than retrying, so a burst would silently
  // drop members off the end of the list.
  for (const r of recipients) {
    await sendEmail({ to: r.email, ...email });
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  await markNotified(alerts);

  return NextResponse.json({ scan, alerts: alerts.length, emailed: recipients.length, pushed });
}

/** Never fatal: a failed push must not stop the email or the notified mark. */
async function pushAlerts(vips: string[], alerts: ValueAlert[]) {
  const payload = valueAlertsPayload(alerts);
  if (!pushConfigured || !payload) return null;
  const admin = supabaseAdmin();
  const devices = await loadSubscriptions(admin, { valueAlertsFor: vips });
  const result = await sendPushBatch(
    devices.map((d) => ({ id: d.id, target: d, payload })),
    // Prices move: an alert still undelivered after six hours is stale.
    { ttl: 6 * 3600, topic: "value-alerts", urgency: "high" },
  );
  await recordOutcome(admin, result);
  return summarise(result);
}
