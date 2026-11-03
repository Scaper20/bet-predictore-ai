import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DataLayer } from "@/lib/providers/data-layer";

export interface CompetitionHealth {
  leagueCode: string;
  name: string;
  matchesLoaded: number;
  resultsInTraining: number;
  lastMatchUpdate: string | null;
  lastSuccessBySource: Record<string, string>;
  failedRuns7d: number;
  unresolved: number;
  flaggedGaps: number;
}

export interface SourceRow {
  id: string;
  label: string;
  enabled: boolean;
  notes: string | null;
}

/** FotMob match details (migration 0091): per competition, from each job's latest run. */
export interface FotmobHealth {
  matchesWithDetails: number;
  players: number;
  clubProfiles: number;
  absenceSnapshots: number;
  lastUpcomingRun: string | null;
  lastTeamsRun: string | null;
  /** The live lane's last run that fetched something (migration 0096; quiet runs are not logged). */
  lastLiveRun: string | null;
  /** Player profiles held (migration 0093). */
  playerProfiles: number | null;
  /** The latest player-props run (migration 0094): null until it has run. */
  props: { at: string; status: string; matches: number; projections: number; lines: number; unmatched: number; starters: number; startersWithLines: number; skippedMarkets: number; picks: number; settled: number } | null;
  leagues: {
    leagueCode: string;
    season: string | null;
    at: string;
    status: string;
    linked: number;
    fetched: number;
    remaining: number;
    unmatched: number;
    warning: string | null;
  }[];
}

export interface DataHealth {
  available: boolean;
  fotmob: FotmobHealth | null;
  dataLayer: DataLayer;
  sources: SourceRow[];
  competitions: CompetitionHealth[];
  recentFailures: { job: string; source: string; leagueCode: string | null; at: string; error: string | null }[];
  unresolved: { source: string; scope: string; leagueCode: string | null; rawName: string; occurrences: number }[];
  duplicates: { scope: string; canonical: string; other: string; otherSource: string }[];
  gaps: { leagueCode: string; season: string; source: string; expected: number | null; loaded: number; note: string }[];
}

const EMPTY: DataHealth = {
  available: false, fotmob: null, dataLayer: "live", sources: [], competitions: [], recentFailures: [], unresolved: [], duplicates: [], gaps: [],
};

/** Everything the admin Data health page shows, in one read. Empty (not an error) before migration 0029. */
export async function getDataHealth(): Promise<DataHealth> {
  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return EMPTY;
  }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [health, settings, sources, failures, unresolved, duplicates, gaps] = await Promise.all([
    db.from("data_health").select("*").order("league_code"),
    db.from("site_settings").select("data_layer").maybeSingle(),
    db.from("ingest_sources").select("id, label, enabled, notes").order("id"),
    db.from("ingest_runs").select("job, source, league_code, started_at, error")
      .eq("status", "failed").gte("started_at", since).order("started_at", { ascending: false }).limit(25),
    db.from("unresolved_entities").select("source, scope, league_code, raw_name, occurrences")
      .is("resolved_team_id", null).order("occurrences", { ascending: false }).limit(50),
    db.from("team_duplicate_candidates").select("scope, canonical_name, other_name, other_source").limit(50),
    db.from("season_coverage").select("league_code, season, source, expected, loaded, gap_note")
      .not("gap_note", "is", null).order("league_code").order("season"),
  ]);
  if (health.error) return EMPTY;
  const fotmob = await fotmobHealth(db).catch(() => null);

  const mode = settings.data?.data_layer;
  return {
    available: true,
    fotmob,
    dataLayer: mode === "db" || mode === "db_fallback" ? mode : "live",
    sources: (sources.data ?? []) as SourceRow[],
    competitions: (health.data ?? []).map((r) => ({
      leagueCode: r.league_code, name: r.name,
      matchesLoaded: Number(r.matches_loaded), resultsInTraining: Number(r.results_in_training),
      lastMatchUpdate: r.last_match_update, lastSuccessBySource: r.last_success_by_source ?? {},
      failedRuns7d: Number(r.failed_runs_7d), unresolved: Number(r.unresolved_entities), flaggedGaps: Number(r.flagged_gaps),
    })),
    recentFailures: (failures.data ?? []).map((f) => ({
      job: f.job, source: f.source, leagueCode: f.league_code, at: f.started_at, error: f.error,
    })),
    unresolved: (unresolved.data ?? []).map((u) => ({
      source: u.source, scope: u.scope, leagueCode: u.league_code, rawName: u.raw_name, occurrences: u.occurrences,
    })),
    duplicates: (duplicates.data ?? []).map((d) => ({
      scope: d.scope, canonical: d.canonical_name, other: d.other_name, otherSource: d.other_source,
    })),
    gaps: (gaps.data ?? []).map((g) => ({
      leagueCode: g.league_code, season: g.season, source: g.source, expected: g.expected, loaded: g.loaded, note: g.gap_note,
    })),
  };
}

async function fotmobHealth(db: ReturnType<typeof supabaseAdmin>): Promise<FotmobHealth | null> {
  const count = async (table: string) => {
    const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw error;
    return n ?? 0;
  };
  const [details, players, profiles, snapshots, runs, playerProfiles, propsRun] = await Promise.all([
    count("match_details"),
    count("players"),
    count("team_profiles"),
    count("availability_snapshots"),
    db.from("ingest_runs").select("job, league_code, status, started_at, meta")
      .eq("source", "fotmob").neq("job", "player-props").order("started_at", { ascending: false }).limit(300),
    count("player_profiles").catch(() => null),
    db.from("ingest_runs").select("status, started_at, meta").eq("job", "player-props").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (runs.error) throw runs.error;
  type Run = { job: string; league_code: string | null; status: string; started_at: string; meta: Record<string, unknown> | null };
  const rows = (runs.data ?? []) as Run[];
  const latest = new Map<string, Run>();
  for (const r of rows) {
    // The latest current-season run per competition (backfill runs carry an older season).
    if (r.job !== "fotmob-matches" || !r.league_code) continue;
    if (!latest.has(r.league_code)) latest.set(r.league_code, r);
  }
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
  return {
    matchesWithDetails: details,
    players,
    clubProfiles: profiles,
    absenceSnapshots: snapshots,
    lastUpcomingRun: rows.find((r) => r.job === "fotmob-upcoming")?.started_at ?? null,
    lastTeamsRun: rows.find((r) => r.job === "fotmob-teams")?.started_at ?? null,
    lastLiveRun: rows.find((r) => r.job === "fotmob-live")?.started_at ?? null,
    playerProfiles,
    props: propsRun.data
      ? {
          at: propsRun.data.started_at, status: propsRun.data.status,
          matches: num(propsRun.data.meta?.matches), projections: num(propsRun.data.meta?.projections), lines: num(propsRun.data.meta?.lines),
          unmatched: num(propsRun.data.meta?.unmatched), skippedMarkets: num(propsRun.data.meta?.skippedMarkets),
          starters: num(propsRun.data.meta?.starters), startersWithLines: num(propsRun.data.meta?.startersWithLines),
          picks: num(propsRun.data.meta?.picks), settled: num(propsRun.data.meta?.settled),
        }
      : null,
    leagues: [...latest.values()]
      .map((r) => ({
        leagueCode: r.league_code as string,
        season: typeof r.meta?.season === "string" ? r.meta.season : null,
        at: r.started_at,
        status: r.status,
        linked: num(r.meta?.linked_total),
        fetched: num(r.meta?.fetched),
        remaining: num(r.meta?.remaining),
        unmatched: num(r.meta?.unmatched),
        warning: Array.isArray(r.meta?.warnings) ? String((r.meta?.warnings as unknown[])[0] ?? "") || null : null,
      }))
      .sort((a, b) => a.leagueCode.localeCompare(b.leagueCode)),
  };
}
