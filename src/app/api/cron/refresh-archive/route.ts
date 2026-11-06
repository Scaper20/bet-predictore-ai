import { NextResponse } from "next/server";
import { refreshArchive, refreshEspnCorners, refreshEspnGoals, refreshEspnShots, seasonsMissingReds } from "@/lib/archive/refresh";
import { refreshReferees } from "@/lib/archive/referees";
import { fillMarketGoals } from "@/lib/archive/market-goals";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily: tops up the training archive from football-data.co.uk (scores,
 * shots, corners, cards, referees) and stores the referees named for the
 * coming fixtures. Its own job, before settle-predictions: as the last step
 * of that one it ran out of time and the archive stopped growing after
 * 20 September 2026. Then fills shots on target from ESPN for the
 * competitions football-data.co.uk and TheSportsDB store without them.
 * Last, solves the goals each finished game's closing prices implied.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ?seasons=2425,2526 reloads past seasons too, to backfill new columns;
  // without it, past seasons still missing red cards (0072) reload on their own.
  const asked = (new URL(request.url).searchParams.get("seasons") ?? "")
    .split(",")
    .filter((s) => /^\d{4}$/.test(s))
    .slice(0, 4);
  const params = new URL(request.url).searchParams;
  // ?only=market&marketDays=400&marketSkip=0 (then marketSkip=400, 800, ...) backfills the
  // goals the closing prices implied, a window at a time, without the other jobs.
  if (params.get("only") === "market") {
    const days = Math.min(400, Math.max(1, Number(params.get("marketDays")) || 60));
    const skip = Math.max(0, Number(params.get("marketSkip")) || 0);
    return NextResponse.json({ marketGoals: await fillMarketGoals(days, skip).catch((err) => ({ error: String(err) })), days, skip });
  }
  const backfill = asked.length ? asked : await seasonsMissingReds().catch(() => []);
  const [[archive, shots, corners, goals], referees, marketGoals] = await Promise.all([
    (async () => {
      const a = await refreshArchive(new Date(), backfill).catch((err) => ({ error: String(err) }));
      const sh = await refreshEspnShots().catch((err) => ({ error: String(err) }));
      const c = await refreshEspnCorners().catch((err) => ({ error: String(err) }));
      return [a, sh, c, await refreshEspnGoals().catch((err) => ({ error: String(err) }))] as const;
    })(),
    refreshReferees().catch((err) => ({ error: String(err) })),
    // The goals the closing prices implied for games finished in the last two
    // months, for the market-informed fit (model/params.ts, goals-v3).
    fillMarketGoals(60).catch((err) => ({ error: String(err) })),
  ]);
  return NextResponse.json({ archive, shots, corners, goals, referees, marketGoals });
}
