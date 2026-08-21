import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { upcomingFeed, predictBatch } from "@/lib/service";
import { getMatch } from "@/lib/providers";
import { evaluatePick } from "@/lib/settlement";

// Runs the football providers and Supabase's service-role client — both
// Node-only. Proxy (src/proxy.ts) doesn't touch /api/ at all, so no session
// cookie handling is relevant here either.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Track Record maintenance: log today/tomorrow's headline picks, then settle
 * any previously-logged pick whose kickoff has passed.
 *
 * Wired up via vercel.json as a daily Vercel Cron job. Vercel signs cron
 * requests with `Authorization: Bearer $CRON_SECRET` when that env var is
 * set — required here (not optional like the rest of this app's Supabase
 * config) because, unlike a read-only page, this endpoint writes to the DB.
 * Safe to trigger more often than daily if you want tighter settlement
 * latency (e.g. an external pinger) — every step here is idempotent.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const logged = await logUpcomingPicks(admin);
  const settled = await settlePastPicks(admin);

  return NextResponse.json({ logged, settled });
}

async function logUpcomingPicks(admin: ReturnType<typeof supabaseAdmin>): Promise<number> {
  const { matches } = await upcomingFeed(2);
  if (matches.length === 0) return 0;

  const predictions = await predictBatch(matches, matches.length);
  const rows = predictions
    .filter((p) => p.sufficiency.publishable && p.topPick)
    .map((p) => ({
      match_id: p.match.id,
      league: p.match.league.name,
      home_name: p.match.home.name,
      away_name: p.match.away.name,
      kickoff: p.match.kickoff,
      market: p.topPick!.market,
      label: p.topPick!.label,
      probability: p.topPick!.probability,
      fair_odds: p.topPick!.fairOdds,
    }));

  if (rows.length === 0) return 0;

  const { error } = await admin.from("predictions_log").upsert(rows, { onConflict: "match_id" });
  if (error) throw error;
  return rows.length;
}

async function settlePastPicks(admin: ReturnType<typeof supabaseAdmin>): Promise<number> {
  const { data: pending, error } = await admin
    .from("predictions_log")
    .select("id, match_id, market")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .limit(200);
  if (error) throw error;
  if (!pending || pending.length === 0) return 0;

  let settledCount = 0;
  for (const row of pending) {
    // A postponed/abandoned fixture, or one the providers can no longer
    // resolve, is simply retried on the next run — settled_at stays null
    // rather than the row being force-closed with a guess.
    const match = await getMatch(row.match_id as string).catch(() => null);
    if (!match || match.status !== "finished") continue;
    if (match.score.home === null || match.score.away === null) continue;

    const result = evaluatePick(row.market as string, match.score.home, match.score.away);
    if (!result) continue;

    const { error: updateError } = await admin
      .from("predictions_log")
      .update({
        result,
        actual_home_goals: match.score.home,
        actual_away_goals: match.score.away,
        settled_at: new Date().toISOString(),
      })
      .eq("id", row.id as string);
    if (!updateError) settledCount++;
  }
  return settledCount;
}
