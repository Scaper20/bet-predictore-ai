import { NextResponse } from "next/server";
import { refreshArchive, refreshEspnCorners, refreshEspnGoals, refreshEspnShots, seasonsMissingReds } from "@/lib/archive/refresh";
import { refreshReferees } from "@/lib/archive/referees";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily: tops up the training archive from football-data.co.uk (scores,
 * shots, corners, cards, referees) and stores the referees named for the
 * coming fixtures. Its own job, before settle-predictions: as the last step
 * of that one it ran out of time and the archive stopped growing after
 * 20 September 2026. Then fills shots on target from ESPN for the
 * competitions football-data.co.uk and TheSportsDB store without them.
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
  const backfill = asked.length ? asked : await seasonsMissingReds().catch(() => []);
  const [[archive, shots, corners, goals], referees] = await Promise.all([
    (async () => {
      const a = await refreshArchive(new Date(), backfill).catch((err) => ({ error: String(err) }));
      const sh = await refreshEspnShots().catch((err) => ({ error: String(err) }));
      const c = await refreshEspnCorners().catch((err) => ({ error: String(err) }));
      return [a, sh, c, await refreshEspnGoals().catch((err) => ({ error: String(err) }))] as const;
    })(),
    refreshReferees().catch((err) => ({ error: String(err) })),
  ]);
  return NextResponse.json({ archive, shots, corners, goals, referees });
}
