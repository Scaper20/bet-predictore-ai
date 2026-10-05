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

export interface DataHealth {
  available: boolean;
  dataLayer: DataLayer;
  sources: SourceRow[];
  competitions: CompetitionHealth[];
  recentFailures: { job: string; source: string; leagueCode: string | null; at: string; error: string | null }[];
  unresolved: { source: string; scope: string; leagueCode: string | null; rawName: string; occurrences: number }[];
  duplicates: { scope: string; canonical: string; other: string; otherSource: string }[];
  gaps: { leagueCode: string; season: string; source: string; expected: number | null; loaded: number; note: string }[];
}

const EMPTY: DataHealth = {
  available: false, dataLayer: "live", sources: [], competitions: [], recentFailures: [], unresolved: [], duplicates: [], gaps: [],
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

  const mode = settings.data?.data_layer;
  return {
    available: true,
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
