import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildDailyDigest } from "@/lib/whatsapp-digest-feed";
import { sendEmail } from "@/lib/email";
import { whatsappDigestReadyEmail } from "@/lib/email-templates";
import { APP_TIMEZONE } from "@/lib/format";

// Same reasoning as api/cron/settle-predictions: Node-only (Supabase
// service-role client), and Proxy never touches /api/ at all.
export const runtime = "nodejs";
export const maxDuration = 60;

const NOTIFY_EMAIL = process.env.WHATSAPP_DIGEST_NOTIFY_EMAIL ?? process.env.SUPPORT_INBOX_EMAIL ?? "support@betrix.com.ng";

/**
 * Computes the day's WhatsApp community broadcast once, early — before
 * Africa/Lagos kickoffs — and stores it for the admin dashboard
 * (/admin/whatsapp-digest) to display with one-tap copy buttons. This does
 * NOT post to WhatsApp itself: see whatsapp-digest.ts's module comment for
 * why sending is a human pasting the prepared text, not an automated bot.
 *
 * Wired up via vercel.json as a daily Vercel Cron job, same as
 * settle-predictions — the Hobby plan's once/day cap is exactly what this
 * needs, since the whole point of computing once is that an accumulator's
 * legs must all be visible together, not revealed as each kicks off.
 *
 * Same CRON_SECRET gate as settle-predictions: required, not optional,
 * because this writes to the DB and sends an email.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const digest = await buildDailyDigest(now);
  const digestDate = now.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });

  const admin = supabaseAdmin();
  const { error } = await admin.from("whatsapp_digests").upsert(
    {
      digest_date: digestDate,
      has_picks: digest.hasPicks,
      picks_message: digest.picksMessage,
      acca_messages: digest.accaMessages,
    },
    { onConflict: "digest_date" },
  );
  if (error) throw error;

  void sendEmail({
    to: NOTIFY_EMAIL,
    ...whatsappDigestReadyEmail({
      hasPicks: digest.hasPicks,
      messageCount: 1 + digest.accaMessages.length,
    }),
  });

  return NextResponse.json({ digestDate, hasPicks: digest.hasPicks, messageCount: 1 + digest.accaMessages.length });
}
