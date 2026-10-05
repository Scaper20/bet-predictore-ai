import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LEAGUES } from "@/lib/leagues";
import { readBoard, writeBoard } from "@/lib/odds/boards";
import { fetchUpcomingPage, PAGE_SIZE, sportyBetBoardKey } from "@/lib/odds/sportybet";
import { fetchBoard, oddsApiBoardKey, oddsApiQuota, ODDS_API_BOARDS } from "@/lib/odds/the-odds-api";
import { oddsApiBoardDue } from "@/lib/odds/snapshot-pacing";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Captures odds boards into public.odds_boards so pages can price picks
 * without calling a bookmaker feed while they render (site_settings.data_layer
 * "db" or "db_fallback").
 *
 * Called hourly by pg_cron (public.invoke_odds_snapshot, migration 0030) with
 * `Authorization: Bearer $CRON_SECRET`, the same gate as the Vercel crons.
 *
 * - The Odds API (free, 500 credits a month): paced by oddsApiBoardDue so the
 *   month's credits last the month, and only for competitions with games in
 *   the next three days.
 * - SportyBet via parse.bot (metered): OFF unless SPORTYBET_SNAPSHOTS=on.
 *   Hourly snapshots of every catalogued competition cost about 720 parse.bot
 *   credits a day; turn it on only once the parse.bot plan covers that.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const started = new Date().toISOString();
  const report = { sportybet: { boards: 0, events: 0, skipped: "" }, oddsApi: { refreshed: 0, due: 0, remaining: null as number | null } };
  const errors: string[] = [];

  const { data: src } = await admin.from("ingest_sources").select("enabled").eq("id", "odds").maybeSingle();
  if (src && src.enabled === false) {
    await admin.from("ingest_runs").insert({ job: "odds-snapshot", source: "odds", status: "skipped", started_at: started,
      finished_at: new Date().toISOString(), error: "source disabled in ingest_sources" });
    return NextResponse.json({ skipped: true });
  }

  // Competitions with games soon. If the matches table is still empty (layer
  // not populated yet), treat every competition as active.
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { data: upcoming } = await admin.from("matches").select("league_code").gte("kickoff", started).lte("kickoff", soon);
  const { count: anyMatches } = await admin.from("matches").select("id", { count: "exact", head: true });
  const active = new Set((upcoming ?? []).map((r) => r.league_code as string));
  const hasUpcoming = (code: string) => !anyMatches || active.has(code);

  if (process.env.SPORTYBET_SNAPSHOTS === "on") {
    for (const league of LEAGUES) {
      const tid = league.ids.sportyBet;
      if (!tid || !hasUpcoming(league.code)) continue;
      try {
        const events = await fetchUpcomingPage(1, PAGE_SIZE, tid);
        if (events.length) {
          await writeBoard(sportyBetBoardKey(1, PAGE_SIZE, tid), "odds", events, { league: league.code });
          report.sportybet.boards++;
          report.sportybet.events += events.length;
        }
      } catch (err) {
        errors.push(`sportybet ${league.code}: ${String(err)}`);
      }
    }
  } else {
    report.sportybet.skipped = "SPORTYBET_SNAPSHOTS is not on";
  }

  // Credits left, as last reported and stored with a board.
  let remaining: number | null = null;
  for (const { leagueCode, marketKey } of ODDS_API_BOARDS) {
    const b = await readBoard(oddsApiBoardKey(leagueCode, marketKey));
    const r = b?.meta?.remaining;
    if (typeof r === "number" && (remaining === null || r < remaining)) remaining = r;
  }
  for (const { leagueCode, marketKey } of ODDS_API_BOARDS) {
    const key = oddsApiBoardKey(leagueCode, marketKey);
    const stored = await readBoard(key);
    const due = oddsApiBoardDue({
      boards: ODDS_API_BOARDS.length, remaining, lastFetched: stored?.fetchedAt ?? null, hasUpcoming: hasUpcoming(leagueCode),
    });
    if (!due) continue;
    report.oddsApi.due++;
    try {
      const events = await fetchBoard(leagueCode, marketKey);
      const q = oddsApiQuota();
      remaining = q.remaining ?? remaining;
      if (events.length) {
        await writeBoard(key, "odds", events, { league: leagueCode, market: marketKey, remaining: q.remaining });
        report.oddsApi.refreshed++;
      }
    } catch (err) {
      errors.push(`odds-api ${leagueCode}/${marketKey}: ${String(err)}`);
    }
  }
  report.oddsApi.remaining = remaining;

  await admin.from("ingest_runs").insert({
    job: "odds-snapshot", source: "odds", status: errors.length ? "partial" : "ok", started_at: started,
    finished_at: new Date().toISOString(), rows_written: report.sportybet.boards + report.oddsApi.refreshed,
    error: errors[0] ?? null, meta: { ...report, errors: errors.slice(0, 20) },
  });
  return NextResponse.json(report);
}
