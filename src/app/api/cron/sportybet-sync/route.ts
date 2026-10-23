import { NextResponse } from "next/server";
import { syncSportyBet } from "@/lib/odds/sportybet-sync";
import { verifyFinished } from "@/lib/odds/sportybet-verify";

// Node-only (service-role client), like the other crons.
export const runtime = "nodejs";
// Eleven competitions, a few SportyBet pages each, one after another.
export const maxDuration = 300;

/**
 * Matches every upcoming fixture to its SportyBet event and stores the links
 * (src/lib/odds/sportybet-sync.ts). Daily at 05:30 Lagos (vercel.json), ahead
 * of the Code Hub at 07:00, and also run hourly by the odds snapshot. Pass
 * ?league=premier-league,la-liga to sync only those. Then checks finished
 * games' links against their results (sportybet-verify.ts).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const only = new URL(request.url).searchParams.get("league")?.split(",").filter(Boolean);
  const reports = await syncSportyBet(only);
  if (!reports) return NextResponse.json({ skipped: "SportyBet direct is switched off" });
  const verified = await verifyFinished().catch(() => null);
  return NextResponse.json({ reports, verified });
}
