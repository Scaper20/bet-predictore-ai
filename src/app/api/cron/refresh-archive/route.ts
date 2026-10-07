import { NextResponse } from "next/server";
import { refreshArchive } from "@/lib/archive/refresh";
import { refreshReferees } from "@/lib/archive/referees";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily: tops up the training archive from football-data.co.uk (scores,
 * shots, corners, cards, referees) and stores the referees named for the
 * coming fixtures. Its own job, before settle-predictions: as the last step
 * of that one it ran out of time and the archive stopped growing after
 * 20 September 2026.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ?seasons=2425,2526 reloads past seasons too, to backfill new columns.
  const backfill = (new URL(request.url).searchParams.get("seasons") ?? "")
    .split(",")
    .filter((s) => /^\d{4}$/.test(s))
    .slice(0, 4);
  const [archive, referees] = await Promise.all([
    refreshArchive(new Date(), backfill).catch((err) => ({ error: String(err) })),
    refreshReferees().catch((err) => ({ error: String(err) })),
  ]);
  return NextResponse.json({ archive, referees });
}
