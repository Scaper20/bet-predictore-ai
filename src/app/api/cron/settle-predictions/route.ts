import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { upcomingFeed, predictBatch } from "@/lib/service";
import { runSettlementPass } from "@/lib/settlement-runner";
import { ACTIVE_MODEL_ID } from "@/lib/model/registry";

// Runs the football providers and Supabase's service-role client — both
// Node-only. Proxy (src/proxy.ts) doesn't touch /api/ at all, so no session
// cookie handling is relevant here either.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Track Record maintenance: log today/tomorrow's headline picks, then settle
 * any previously-logged pick whose kickoff has passed.
 *
 * Wired up via vercel.json as a daily Vercel Cron job (Hobby plan caps cron
 * to once/day regardless of the schedule string). This is now just the
 * full-backlog safety net — the actual near-real-time settlement runs
 * opportunistically off of every /api/live poll (src/app/api/live/route.ts),
 * which isn't bound by cron frequency at all. This route still matters for
 * matches nobody had a live view open for.
 *
 * Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET` when
 * that env var is set — required here (not optional like the rest of this
 * app's Supabase config) because, unlike a read-only page, this endpoint
 * writes to the DB.
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
  const settled = await runSettlementPass(admin);

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
      // The name is kept for display; the code is what every aggregate groups
      // on. They are not interchangeable — the name is whichever string the
      // answering provider used, and the three feeds disagree about all of
      // them. See 0013_league_code.sql.
      league_code: p.match.league.code ?? null,
      home_name: p.match.home.name,
      away_name: p.match.away.name,
      kickoff: p.match.kickoff,
      market: p.topPick!.market,
      label: p.topPick!.label,
      probability: p.topPick!.probability,
      fair_odds: p.topPick!.fairOdds,
      // Stamped rather than left to the column default, so the attribution is
      // correct on the day a second model starts writing here — the default
      // only exists to backfill rows written before 0012.
      model_id: ACTIVE_MODEL_ID,
    }));

  if (rows.length === 0) return 0;

  const { error } = await admin.from("predictions_log").upsert(rows, { onConflict: "match_id" });
  if (error) throw error;
  return rows.length;
}
