import { NextResponse } from "next/server";
import { todayHub } from "@/lib/code-hub-feed";

// Node-only (service-role client), like the other crons.
export const runtime = "nodejs";
// Predicting the day's fixtures and pricing them can take a while.
export const maxDuration = 300;

/**
 * Builds and stores the day's Code Hub at 07:00 Lagos (vercel.json), so the
 * codes are drawn from the whole day's games rather than whatever is left
 * when the first visitor opens the page. Idempotent: a day already stored is
 * read back, never rebuilt, and booking runs after the response
 * (code-hub-feed.ts bookMissing).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const hub = await todayHub();
  return NextResponse.json({
    day: hub.day,
    stored: hub.stored,
    codes: hub.codes.map((c) => ({
      tier: c.tier,
      odds: c.odds,
      chance: c.probability,
      legs: c.legs.map((l) => `${l.kickoff.slice(0, 16)} ${l.homeName} v ${l.awayName}: ${l.label} (${Math.round(l.probability * 100)}%)`),
    })),
  });
}
