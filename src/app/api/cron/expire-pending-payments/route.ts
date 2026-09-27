import { NextResponse } from "next/server";
import { expireStalePendingPayments } from "@/lib/payments-feed";

// Node-only (Supabase service-role client), same as the other cron routes;
// Proxy (formerly middleware) never touches /api/ at all.
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Daily sweep for checkout attempts that never got a Paystack webhook at
 * all — see src/lib/payments-feed.ts for the threshold and why 24h is
 * safe. Wired up via vercel.json alongside settle-predictions/
 * whatsapp-digest; Hobby's once-a-day cap is fine here since this is a
 * backstop for silence, not something that needs to run often.
 *
 * Same CRON_SECRET gate as the other cron routes — required, not optional,
 * because this writes to the DB.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { expired } = await expireStalePendingPayments();
  return NextResponse.json({ expired });
}
