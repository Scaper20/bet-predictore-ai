import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runPlayerProps } from "@/lib/props-feed";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Player props (src/lib/props-feed.ts): settles finished picks, projects the
 * next 36 hours' starters, captures SportyBet's player lines and logs picks
 * once lineups are confirmed. Called every 15 minutes by pg_cron
 * (public.invoke_player_props, migration 0094) only while there is work, with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const started = new Date().toISOString();
  const report = await runPlayerProps(admin);
  await admin.from("ingest_runs").insert({
    job: "player-props", source: "fotmob", status: report.errors.length ? "partial" : "ok", started_at: started,
    finished_at: new Date().toISOString(), rows_written: report.projections + report.lines + report.picks + report.settled,
    error: report.errors[0] ?? null, meta: { ...report, errors: report.errors.slice(0, 20) },
  });
  return NextResponse.json(report);
}
