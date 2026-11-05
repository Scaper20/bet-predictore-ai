import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getByDate, upcomingDates } from "@/lib/providers";
import { captureMatchResults, runSettlementPass } from "@/lib/settlement-runner";
import type { Match } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Settles every pick the minute its game is over, whether or not anyone has a
 * live page open (CTO follow-up, 5 Nov 2026).
 *
 * Until now a pick settled when a visitor's live-board poll happened to run the
 * pass (src/app/api/live/route.ts), and otherwise at the 03:00 UTC sweep, so
 * a late kickoff or a quiet hour meant the next day. pg_cron calls this every
 * minute (0100_settle_finished.sql), only while something is waiting.
 *
 *   1. Store the final score of every game that has finished today or
 *      yesterday (match_results), writing only what changed. The Code Hub,
 *      tracked slips and the track record all read the stored score.
 *   2. Settle every logged pick whose game is over, headline and engine picks
 *      alike, corners and shots included once ESPN has the counts.
 *
 * Same CRON_SECRET gate as the other cron routes: it writes to the database.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const now = new Date();
  const days = [upcomingDates(1, now)[0], upcomingDates(1, new Date(now.getTime() - 86_400_000))[0]];
  const games = (await Promise.all(days.map((d) => getByDate(d).catch(() => [] as Match[])))).flat();
  const stored = await captureChanged(admin, games.filter((m) => m.status === "finished"));

  // From 95 minutes after kickoff a game can be over, so only then is it looked up; at most 25 look-ups a minute.
  const settled = await runSettlementPass(admin, { maxAgeHours: 8, refetchAfterMinutes: 95, maxRefetch: 25, withStats: true });
  return NextResponse.json({ stored, settled });
}

/** Stores the finished games whose stored result differs, so a busy evening does not rewrite the same rows every minute. */
async function captureChanged(admin: ReturnType<typeof supabaseAdmin>, finished: Match[]): Promise<number> {
  if (finished.length === 0) return 0;
  const { data } = await admin
    .from("match_results")
    .select("match_id, status, home_goals, away_goals")
    .in("match_id", finished.map((m) => m.id));
  const have = new Map((data ?? []).map((r) => [r.match_id as string, `${r.status}|${r.home_goals}|${r.away_goals}`]));
  const changed = finished.filter((m) => have.get(m.id) !== `${m.status}|${m.score.home}|${m.score.away}`);
  if (changed.length) await captureMatchResults(admin, changed);
  return changed.length;
}
