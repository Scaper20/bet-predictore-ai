import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUES } from "@/lib/leagues";
import { runPlayerProps, settlePlayerProps } from "@/lib/props-feed";
import { parseMatch } from "./parse";
import { snapshotPrematch, writeMatch } from "./write";

/**
 * The live FotMob lane: the games whose FotMob page is changing right now,
 * fetched every two minutes (pg_cron invoke_fotmob_live, migration 0096) so
 * we are a couple of minutes behind FotMob, not an hour:
 *
 *   lineups   kicking off within 90 minutes, eleven not yet confirmed: the
 *             moment FotMob confirms it, the game's props are projected and
 *             its picks logged in the same run
 *   in play   kicked off, not yet final: events, shots and stats as they come
 *   final     just finished: player stats land, props settle in the same run
 *
 * Everything else (history, profiles, the 72-hour look-ahead) stays with the
 * Python jobs, which write the same rows (src/lib/fotmob/parse.ts parity).
 * Polite: our own User-Agent, one request at a time, a gap between them.
 */

const BASE = "https://www.fotmob.com/api/data";
const USER_AGENT = "KiqStat-ingestion/0.1 (+https://www.kiqstat.app)";
const FOTMOB_CODES = LEAGUES.filter((l) => l.ids.fotMob).map((l) => l.code);
const LINEUP_WINDOW_MS = 90 * 60_000;
const AFTER_KICKOFF_MS = 6 * 3_600_000;
/** A finished game FotMob gives no player stats for is retried this often, not every run. */
const NO_STATS_RETRY_MS = 20 * 60_000;
const MAX_GAMES = 12;
const GAP_MS = 1_500;
const TIMEOUT_MS = 12_000;

type Admin = SupabaseClient;

export interface LiveRunReport {
  due: number;
  fetched: number;
  lineupsConfirmed: number;
  finished: number;
  rows: number;
  props: { projections: number; picks: number; settled: number } | null;
  errors: string[];
}

interface Due {
  matchId: string;
  fotmobId: string;
  kickoff: number;
  reason: "lineup" | "live" | "final";
  wasConfirmed: boolean;
  wasFinal: boolean;
}

/** The games that need FotMob now, most time-critical first. */
export async function dueGames(admin: Admin, now = Date.now()): Promise<Due[]> {
  const { data: games, error } = await admin
    .from("matches")
    .select("id, source_ids, kickoff, status")
    .gte("kickoff", new Date(now - AFTER_KICKOFF_MS).toISOString())
    .lte("kickoff", new Date(now + LINEUP_WINDOW_MS).toISOString())
    .in("league_code", FOTMOB_CODES)
    .not("status", "in", "(postponed,cancelled)")
    .order("kickoff")
    .limit(80);
  if (error) throw new Error(`matches: ${error.message}`);
  const linked = (games ?? []).filter((g) => (g.source_ids as Record<string, string> | null)?.fotmob);
  if (!linked.length) return [];
  const { data: details } = await admin
    .from("match_details")
    .select("match_id, lineup_type, finished, has_player_stats, fetched_at")
    .in("match_id", linked.map((g) => g.id));
  return classifyDue(linked, details ?? [], now);
}

export interface DueGame {
  id: string;
  source_ids: unknown;
  kickoff: string;
}

export interface DueDetails {
  match_id: string;
  lineup_type: string | null;
  finished: boolean | null;
  has_player_stats: boolean | null;
  fetched_at: string | null;
}

/** Pure: which linked games need FotMob now, and why, most time-critical first. */
export function classifyDue(games: DueGame[], details: DueDetails[], now: number): Due[] {
  const by = new Map(details.map((d) => [d.match_id, d]));
  const out: Due[] = [];
  for (const g of games) {
    const fotmobId = (g.source_ids as Record<string, string> | null)?.fotmob;
    if (!fotmobId) continue;
    const d = by.get(g.id);
    const kickoff = Date.parse(g.kickoff);
    if (kickoff > now + LINEUP_WINDOW_MS || kickoff < now - AFTER_KICKOFF_MS) continue;
    const confirmed = d?.lineup_type === "standard";
    const final = Boolean(d?.finished && d?.has_player_stats);
    const base = { matchId: g.id, fotmobId: String(fotmobId), kickoff, wasConfirmed: confirmed, wasFinal: final };
    if (kickoff > now) {
      if (!confirmed) out.push({ ...base, reason: "lineup" });
      continue;
    }
    if (final) continue;
    if (d?.finished && !d.has_player_stats && d.fetched_at && now - Date.parse(d.fetched_at) < NO_STATS_RETRY_MS) continue;
    out.push({ ...base, reason: d?.finished ? "final" : "live" });
  }
  const rank = { lineup: 0, final: 1, live: 2 } as const;
  return out.sort((a, b) => rank[a.reason] - rank[b.reason] || a.kickoff - b.kickoff);
}

async function fetchMatch(fotmobId: string): Promise<unknown | null> {
  if (!/^\d{1,12}$/.test(fotmobId)) return null;
  const res = await fetch(`${BASE}/matchDetails?matchId=${fotmobId}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FotMob HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One run of the live lane (the cron route). */
export async function runFotmobLive(admin: Admin): Promise<LiveRunReport> {
  const report: LiveRunReport = { due: 0, fetched: 0, lineupsConfirmed: 0, finished: 0, rows: 0, props: null, errors: [] };
  const due = await dueGames(admin);
  report.due = due.length;
  const confirmedNow: string[] = [];
  let finishedNow = 0;

  for (const [i, g] of due.slice(0, MAX_GAMES).entries()) {
    if (i > 0) await sleep(GAP_MS);
    try {
      const raw = await fetchMatch(g.fotmobId);
      const bundle = raw ? parseMatch(raw) : null;
      if (!bundle) {
        report.errors.push(`${g.fotmobId}: unreadable response`);
        continue;
      }
      if (String(bundle.fotmobId) !== g.fotmobId) {
        report.errors.push(`${g.fotmobId}: FotMob answered for ${bundle.fotmobId}`);
        continue;
      }
      report.fetched++;
      report.rows += await writeMatch(admin, g.matchId, bundle);
      report.rows += await snapshotPrematch(admin, g.matchId, bundle);
      if (!g.wasConfirmed && bundle.details.lineup_type === "standard" && !bundle.started) confirmedNow.push(g.matchId);
      if (!g.wasFinal && bundle.finished && bundle.details.has_player_stats) finishedNow++;
      for (const w of bundle.warnings.slice(0, 3)) report.errors.push(w);
    } catch (e) {
      report.errors.push(`${g.fotmobId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  report.lineupsConfirmed = confirmedNow.length;
  report.finished = finishedNow;

  if (confirmedNow.length || finishedNow) {
    report.props = { projections: 0, picks: 0, settled: 0 };
    if (confirmedNow.length) {
      const p = await runPlayerProps(admin, { matchIds: confirmedNow }).catch((e: unknown) => {
        report.errors.push(`props: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
      if (p) {
        report.props.projections = p.projections;
        report.props.picks = p.picks;
        report.errors.push(...p.errors.slice(0, 5));
      }
    }
    if (finishedNow) {
      report.props.settled = await settlePlayerProps(admin).catch((e: unknown) => {
        report.errors.push(`settle: ${e instanceof Error ? e.message : String(e)}`);
        return 0;
      });
    }
  }
  return report;
}
