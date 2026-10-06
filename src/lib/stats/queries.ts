import "server-only";

/**
 * Database reads behind the stats pages (results, tables, H2H, form, goals,
 * ratings, trends). All of it comes from the scheduled tables, so these
 * pages never call a sports API while they render, whatever the data-layer
 * switch says. Cached in memory briefly; the jobs refresh the tables far
 * less often than pages are viewed.
 */

import { cached } from "@/lib/providers/cache";
import { publicMatchId, type MatchRow } from "@/lib/providers/db-source";
import type { Match, StandingRow } from "@/lib/types";
import type { TeamResult } from "./compute";
import { attachPicks, type PickRow } from "./attach-picks";

async function client() {
  const { supabasePublic } = await import("@/lib/supabase/public");
  const c = supabasePublic();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export interface TeamRef {
  id: string;
  name: string;
  crest?: string;
  scope?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isTeamId = (v: string | undefined | null): v is string => Boolean(v && UUID.test(v));

/** This season's clubs in one competition. */
export function leagueTeams(code: string): Promise<TeamRef[]> {
  return cached(`stats:teams:${code}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.rpc("league_teams", { p_league: code });
    if (error) throw error;
    return ((data ?? []) as { team_id: string; name: string; crest: string | null; scope: string }[]).map((t) => ({
      id: t.team_id, name: t.name, crest: t.crest ?? undefined, scope: t.scope,
    }));
  });
}

interface RecentRow {
  team_id: string;
  match_id: string;
  league_code: string;
  kickoff: string;
  is_home: boolean;
  opponent_id: string | null;
  opponent_name: string;
  opponent_crest: string | null;
  goals_for: number;
  goals_against: number;
  source_ids: Record<string, string> | null;
}

/**
 * The last `perTeam` finished games of each club, most recent first, keyed by
 * team id. `league` restricts them to one competition.
 */
export async function recentResults(teamIds: string[], perTeam = 10, league?: string): Promise<Map<string, TeamResult[]>> {
  const ids = [...new Set(teamIds.filter(isTeamId))].sort();
  const out = new Map<string, TeamResult[]>();
  if (ids.length === 0) return out;
  const key = `stats:recent:${perTeam}:${league ?? "*"}:${ids.join(",")}`;
  const rows = await cached(key, 10 * 60_000, async () => {
    const c = await client();
    const all: RecentRow[] = [];
    // A long id array still goes in one POST body; chunked only so one slow
    // chunk doesn't hold the whole page.
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await c.rpc("team_recent_results", {
        p_team_ids: ids.slice(i, i + 150), p_per_team: perTeam, p_league: league ?? null,
      });
      if (error) throw error;
      all.push(...((data ?? []) as RecentRow[]));
    }
    return all;
  });
  for (const r of rows) {
    const list = out.get(r.team_id) ?? [];
    list.push({
      matchId: r.match_id,
      leagueCode: r.league_code,
      kickoff: r.kickoff,
      isHome: r.is_home,
      opponentId: r.opponent_id,
      opponentName: r.opponent_name,
      opponentCrest: r.opponent_crest ?? undefined,
      goalsFor: r.goals_for,
      goalsAgainst: r.goals_against,
      publicId: publicMatchId({ id: r.match_id, source_ids: r.source_ids }),
    });
    out.set(r.team_id, list);
  }
  return out;
}

/**
 * The current table for a competition.
 *
 * A league can hold rows from two feeds under two season spellings
 * ("2026-2027" from TheSportsDB, "2026-27" from football-data.org). The set
 * refreshed most recently is the live one; picking by the larger season
 * string, as a plain sort would, chose a stale copy for Serie A.
 */
export function leagueTable(code: string): Promise<{ rows: StandingRow[]; season: string | null; updatedAt: string | null }> {
  return cached(`stats:table:${code}`, 5 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("standings")
      .select("season, source, fetched_at, team_id, team_name, position, played, won, drawn, lost, goals_for, goals_against, goal_difference, points, team:teams(crest)")
      .eq("league_code", code)
      .order("position");
    if (error) throw error;
    type Row = Record<string, unknown> & { team: { crest: string | null } | null };
    const rows = (data ?? []) as unknown as Row[];
    if (rows.length === 0) return { rows: [], season: null, updatedAt: null };
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.season}|${r.source}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const freshest = (g: Row[]) => Math.max(...g.map((r) => Date.parse(r.fetched_at as string)));
    const best = [...groups.values()].sort((a, b) => freshest(b) - freshest(a))[0];
    return {
      season: (best[0].season as string) ?? null,
      updatedAt: new Date(freshest(best)).toISOString(),
      rows: best.map((r) => ({
        position: r.position as number,
        team: {
          id: (r.team_id as string) ?? (r.team_name as string),
          name: r.team_name as string,
          shortName: r.team_name as string,
          crest: r.team?.crest ?? undefined,
        },
        played: r.played as number, won: r.won as number, drawn: r.drawn as number, lost: r.lost as number,
        goalsFor: r.goals_for as number, goalsAgainst: r.goals_against as number,
        goalDifference: r.goal_difference as number, points: r.points as number,
      })),
    };
  });
}

export interface Meeting {
  publicId: string;
  leagueCode: string;
  kickoff: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

/** Every finished meeting of two clubs, either way round, newest first. */
export function meetings(a: string, b: string, limit = 30): Promise<Meeting[]> {
  if (!isTeamId(a) || !isTeamId(b) || a === b) return Promise.resolve([]);
  const pair = [a, b].sort();
  return cached(`stats:h2h:${pair.join("|")}:${limit}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("matches")
      .select("id, source_ids, league_code, kickoff, home_team_id, away_team_id, home_name, away_name, home_goals, away_goals")
      .or(`and(home_team_id.eq.${a},away_team_id.eq.${b}),and(home_team_id.eq.${b},away_team_id.eq.${a})`)
      .eq("status", "finished")
      .not("home_goals", "is", null)
      .order("kickoff", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      publicId: publicMatchId({ id: m.id as string, source_ids: m.source_ids as Record<string, string> | null }),
      leagueCode: m.league_code as string,
      kickoff: m.kickoff as string,
      homeId: m.home_team_id as string,
      awayId: m.away_team_id as string,
      homeName: m.home_name as string,
      awayName: m.away_name as string,
      homeGoals: m.home_goals as number,
      awayGoals: m.away_goals as number,
    }));
  });
}

export function teamsById(ids: string[]): Promise<TeamRef[]> {
  const list = [...new Set(ids.filter(isTeamId))].sort();
  if (list.length === 0) return Promise.resolve([]);
  return cached(`stats:teams-by-id:${list.join(",")}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("teams").select("id, name, crest, scope").in("id", list);
    if (error) throw error;
    return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, crest: (t.crest as string | null) ?? undefined, scope: t.scope as string }));
  });
}

/**
 * Clubs and national teams by name, for the H2H pickers. Clubs with a badge
 * first: those are the ones TheSportsDB lists, i.e. the ones with fixtures.
 */
export function searchTeams(q: string, limit = 10): Promise<TeamRef[]> {
  const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 40);
  if (term.length < 2) return Promise.resolve([]);
  return cached(`stats:search:${term.toLowerCase()}`, 10 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("teams")
      .select("id, name, crest, scope")
      .ilike("name", `%${term}%`)
      .limit(40);
    if (error) throw error;
    const lower = term.toLowerCase();
    return (data ?? [])
      .map((t) => ({ id: t.id as string, name: t.name as string, crest: (t.crest as string | null) ?? undefined, scope: t.scope as string }))
      .sort((x, y) =>
        Number(!x.name.toLowerCase().startsWith(lower)) - Number(!y.name.toLowerCase().startsWith(lower)) ||
        Number(!x.crest) - Number(!y.crest) ||
        x.name.length - y.name.length,
      )
      .slice(0, limit);
  });
}

/** A club's id from its name, for pages fed by a live feed whose ids aren't ours. */
export function teamIdByName(name: string, scope?: string): Promise<string | null> {
  return cached(`stats:team-by-name:${scope ?? "*"}:${name.toLowerCase()}`, 60 * 60_000, async () => {
    const c = await client();
    let q = c.from("teams").select("id, crest").ilike("name", name.replace(/[%_]/g, ""));
    if (scope) q = q.eq("scope", scope);
    const { data, error } = await q.limit(2);
    if (error) throw error;
    return data && data.length === 1 ? (data[0].id as string) : null;
  });
}

export interface RatingPoint {
  teamId: string | null;
  teamName: string;
  crest?: string;
  rating: number;
  ratedOn: string;
  /** Rating 20-45 days before ratedOn, for the movers column; null if none. */
  previous: number | null;
}

/**
 * Each club's latest BetriX Elo in one scope, with the rating a month
 * earlier. `scope` is the league's (a country, or the cup's code; national
 * teams share "international").
 */
export function latestRatings(scope: string, since = 400): Promise<RatingPoint[]> {
  return cached(`stats:ratings:${scope}`, 30 * 60_000, async () => {
    const c = await client();
    const from = new Date(Date.now() - since * 86_400_000).toISOString().slice(0, 10);
    const rows: { team_id: string | null; team_name: string; rating: number; rated_on: string; team: { name: string; crest: string | null } | null }[] = [];
    // Paged: the international scope has thousands of rating days.
    for (let page = 0; page < 10; page++) {
      const { data, error } = await c.from("elo_ratings")
        .select("team_id, team_name, rating, rated_on, team:teams(name, crest)")
        .eq("source", "betrix").eq("scope", scope).gte("rated_on", from)
        .order("rated_on", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as typeof rows));
      if (!data || data.length < 1000) break;
    }
    const byTeam = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.team_id ?? `name:${r.team_name}`;
      byTeam.set(k, [...(byTeam.get(k) ?? []), r]);
    }
    return [...byTeam.values()].map((list) => {
      const latest = list[0];
      // "A month ago" means a rating from 20-45 days before the latest. Any
      // older and it can belong to another league: a country's leagues
      // share one rating scope, so a promoted club's last rating in the
      // division below sits in the same series.
      const t = Date.parse(latest.rated_on);
      const prev = list.find((x) => {
        const d = t - Date.parse(x.rated_on);
        return d >= 20 * 86_400_000 && d <= 45 * 86_400_000;
      });
      return {
        teamId: latest.team_id,
        teamName: latest.team?.name ?? latest.team_name,
        crest: latest.team?.crest ?? undefined,
        rating: Number(latest.rating),
        ratedOn: latest.rated_on,
        previous: prev ? Number(prev.rating) : null,
      };
    });
  });
}

export interface LoggedPick {
  matchId: string;
  label: string;
  result: string | null;
}

/**
 * Our published picks for these games, for the results page's tick and cross.
 * Read by id and by kickoff window, then paired in attachPicks: a pick can be
 * logged under a different feed's id from the one the stored match carries.
 */
export function picksFor(matches: Match[]): Promise<Map<string, LoggedPick>> {
  if (matches.length === 0) return Promise.resolve(new Map());
  const times = matches.map((m) => Date.parse(m.kickoff));
  const from = new Date(Math.min(...times) - 3 * 3_600_000).toISOString();
  const to = new Date(Math.max(...times) + 3 * 3_600_000).toISOString();
  const ids = [...new Set(matches.map((m) => m.id))].sort();
  return cached(`stats:picks:${from}:${to}:${ids.join(",")}`, 5 * 60_000, async () => {
    const c = await client();
    const cols = "match_id, label, result, kickoff, home_name, away_name";
    const [byTime, ...byIds] = await Promise.all([
      c.from("predictions_log").select(cols).gte("kickoff", from).lte("kickoff", to).limit(1000),
      ...Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
        c.from("predictions_log").select(cols).in("match_id", ids.slice(i * 100, i * 100 + 100)),
      ),
    ]);
    for (const r of [byTime, ...byIds]) if (r.error) throw r.error;
    const rows = new Map<string, PickRow>();
    for (const r of [byTime, ...byIds]) for (const p of (r.data ?? []) as PickRow[]) rows.set(p.match_id, p);
    return attachPicks(matches, [...rows.values()]);
  }).catch(() => new Map());
}

export function playedBetween(start: Date, end: Date, league?: string): Promise<Match[]> {
  return cached(`stats:played:${start.toISOString()}:${league ?? "*"}`, 2 * 60_000, async () => {
    const { MATCH_SELECT, rowToMatch } = await import("@/lib/providers/db-source");
    const c = await client();
    let q = c.from("matches").select(MATCH_SELECT)
      .gte("kickoff", start.toISOString()).lt("kickoff", end.toISOString())
      .in("status", ["finished", "live", "halftime", "postponed", "cancelled"]);
    if (league) q = q.eq("league_code", league);
    const { data, error } = await q.order("kickoff");
    if (error) throw error;
    return ((data ?? []) as unknown as MatchRow[]).map(rowToMatch);
  });
}
