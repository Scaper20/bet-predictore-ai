import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runFotmobLive } from "@/lib/fotmob/live";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The live FotMob lane (src/lib/fotmob/live.ts): lineups as FotMob confirms
 * them, in-play events, and final player stats, a couple of minutes behind
 * FotMob, with props projected, logged and settled in the same run. Called
 * every two minutes by pg_cron (public.invoke_fotmob_live, migration 0096)
 * only while a game needs it, with `Authorization: Bearer $CRON_SECRET`.
 * Respects ingest_sources: switching the "fotmob" source off stops it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const started = new Date().toISOString();
  const { data: src } = await admin.from("ingest_sources").select("enabled").eq("id", "fotmob").maybeSingle();
  if (src && src.enabled === false) {
    await admin.from("ingest_runs").insert({ job: "fotmob-live", source: "fotmob", status: "skipped", started_at: started,
      finished_at: new Date().toISOString(), error: "source disabled in ingest_sources" });
    return NextResponse.json({ skipped: true });
  }

  const report = await runFotmobLive(admin).catch((e: unknown) => ({
    due: 0, fetched: 0, lineupsConfirmed: 0, finished: 0, rows: 0, props: null,
    errors: [e instanceof Error ? e.message : String(e)],
  }));
  // Quiet runs (nothing fetched, nothing wrong) are not logged: every two minutes would bury the log.
  if (report.fetched || report.errors.length) {
    await admin.from("ingest_runs").insert({
      job: "fotmob-live", source: "fotmob", status: report.errors.length ? "partial" : "ok", started_at: started,
      finished_at: new Date().toISOString(), rows_written: report.rows,
      error: report.errors[0] ?? null, meta: { ...report, errors: report.errors.slice(0, 20) },
    });
  }
  return NextResponse.json(report);
}
