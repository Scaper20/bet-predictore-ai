/**
 * Reads the scheduled data layer (migration 0029) in the shapes the provider
 * facade returns, so pages can't tell which layer answered.
 *
 * Match ids follow the same preference the live merge uses: football-data's
 * id, then TheSportsDB's, and an internal "db:" id only for games no feed has
 * named. predictions_log, settlement and saved slips all key on these ids, so
 * a game keeps the id it had before the switch and is never logged twice.
 *
 * The Supabase client is imported lazily: it is server-only, and this module
 * sits under the facade that unit tests import.
 */

import type { LeagueRef, Match, MatchStatus, ResultRow, StandingRow, Team } from "@/lib/types";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { cached } from "./cache";

export interface MatchRow {
  id: string;
  league_code: string;
  kickoff: string;
  status: MatchStatus;
  minute: number | null;
  home_goals: number | null;
  away_goals: number | null;
  ht_home: number | null;
  ht_away: number | null;
  round: string | null;
  venue: string | null;
  source_ids: Record<string, string> | null;
  home_name: string;
  away_name: string;
  home: { id: string; name: string; crest: string | null } | null;
  away: { id: string; name: string; crest: string | null } | null;
}

export const MATCH_SELECT =
  "id, league_code, kickoff, status, minute, home_goals, away_goals, ht_home, ht_away, round, venue, source_ids, " +
  "home_name, away_name, home:teams!matches_home_team_id_fkey(id, name, crest), away:teams!matches_away_team_id_fkey(id, name, crest)";

/** The id a page, a prediction log row or a saved slip knows this game by. */
export function publicMatchId(row: Pick<MatchRow, "id" | "source_ids">): string {
  const ids = row.source_ids ?? {};
  if (ids["football-data-org"]) return `fd:${ids["football-data-org"]}`;
  if (ids.thesportsdb) return `sdb:${ids.thesportsdb}`;
  return `db:${row.id}`;
}

/**
 * How to find the row an id from a page URL or a log row refers to.
 *
 * Feed ids are matched by JSON containment on source_ids rather than a
 * "->>" path: a key like "football-data-org" is awkward in PostgREST's path
 * syntax, and containment can use the GIN index from migration 0029.
 */
export type IdLookup =
  | { kind: "contains"; value: Record<string, string> }
  | { kind: "id"; value: string };

export function sourceKeyForId(id: string): IdLookup | null {
  const [prefix, ...rest] = id.split(":");
  const value = rest.join(":");
  if (!value) return null;
  if (prefix === "fd") return { kind: "contains", value: { "football-data-org": value } };
  if (prefix === "sdb") return { kind: "contains", value: { thesportsdb: value } };
  if (prefix === "db") return { kind: "id", value };
  return null; // "af:" ids belong to a feed this layer doesn't ingest
}

function team(t: MatchRow["home"], fallbackName: string): Team {
  const name = t?.name ?? fallbackName;
  return { id: t?.id ?? `name:${name.toLowerCase().replace(/\s+/g, "-")}`, name, shortName: name, crest: t?.crest ?? undefined };
}

function leagueRef(code: string): LeagueRef {
  const def = leagueByCode(code);
  return { id: code, name: def?.name ?? code, country: def?.country, code };
}

export function rowToMatch(row: MatchRow): Match {
  const id = publicMatchId(row);
  return {
    id,
    kickoff: new Date(row.kickoff).toISOString(),
    status: row.status,
    minute: row.status === "live" ? row.minute : null,
    league: leagueRef(row.league_code),
    home: team(row.home, row.home_name),
    away: team(row.away, row.away_name),
    score: { home: row.home_goals, away: row.away_goals },
    halftime: row.ht_home != null || row.ht_away != null ? { home: row.ht_home, away: row.ht_away } : undefined,
    venue: row.venue,
    round: row.round,
    source: id.startsWith("fd:") ? "football-data" : "thesportsdb",
  };
}

async function client() {
  const { supabasePublic } = await import("@/lib/supabase/public");
  const c = supabasePublic();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

async function matchesWhere(
  apply: (q: ReturnType<ReturnType<Awaited<ReturnType<typeof client>>["from"]>["select"]>) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Match[]> {
  const c = await client();
  const { data, error } = await apply(c.from("matches").select(MATCH_SELECT));
  if (error) throw error;
  return ((data ?? []) as MatchRow[]).map(rowToMatch);
}

export function dbLive(): Promise<Match[]> {
  return cached("db:live", 15_000, () => matchesWhere((q) => q.in("status", ["live", "halftime"])));
}

export function dbByDate(date: string): Promise<Match[]> {
  return cached(`db:day:${date}`, 60_000, () => matchesWhere((q) => q.eq("kickoff_day", date).order("kickoff")));
}

export function dbUpcoming(days: number, leagueCode?: string): Promise<Match[]> {
  const from = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
  const to = new Date(Date.now() + days * 86_400_000).toISOString();
  return cached(`db:upcoming:${days}:${leagueCode ?? "*"}`, 60_000, () =>
    matchesWhere((q) => {
      const base = q.gte("kickoff", from).lte("kickoff", to).not("status", "in", "(finished,cancelled)");
      return (leagueCode ? base.eq("league_code", leagueCode) : base).order("kickoff");
    }),
  );
}

export function dbMatch(id: string): Promise<Match | null> {
  const key = sourceKeyForId(id);
  if (!key) return Promise.resolve(null);
  return cached(`db:match:${id}`, 15_000, async () => {
    const [first] = await matchesWhere((q) =>
      (key.kind === "id" ? q.eq("id", key.value) : q.contains("source_ids", key.value)).limit(1),
    );
    return first ?? null;
  });
}

/** Finished results for one competition, as the model trains on them. */
export function dbSeasonResults(league: LeagueDef, limit = 1200): Promise<ResultRow[]> {
  return cached(`db:results:${league.code}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("historical_results")
      .select("kickoff, home_name, away_name, home_goals, away_goals")
      .eq("league_code", league.code)
      .order("kickoff", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      homeId: r.home_name as string,
      awayId: r.away_name as string,
      homeName: r.home_name as string,
      awayName: r.away_name as string,
      homeGoals: r.home_goals as number,
      awayGoals: r.away_goals as number,
      date: Date.parse(r.kickoff as string),
      leagueId: league.code,
    })).sort((a, b) => a.date - b.date);
  });
}

export function dbStandings(league: LeagueDef): Promise<StandingRow[]> {
  return cached(`db:table:${league.code}`, 10 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.from("standings")
      .select("season, source, fetched_at, team_id, team_name, position, played, won, drawn, lost, goals_for, goals_against, goal_difference, points, team:teams(crest)")
      .eq("league_code", league.code)
      .order("position");
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { team: { crest: string | null } | null }>;
    // Two feeds can hold a table under two season spellings ("2026-2027",
    // "2026-27"); the set refreshed last is the current one. Sorting on the
    // season string picked a stale copy ("2026-27" sorts after "2026-2027").
    const latest = rows.reduce<(typeof rows)[number] | undefined>(
      (best, r) => (!best || Date.parse(r.fetched_at as string) > Date.parse(best.fetched_at as string) ? r : best),
      undefined,
    );
    return rows.filter((r) => latest && r.season === latest.season && r.source === latest.source).map((r) => ({
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
    }));
  });
}

/**
 * Past meetings of two clubs, either way round, from the training results.
 *
 * The history spells clubs the way each source does, so the query asks for
 * every stored spelling of both clubs and the rows come back under the
 * canonical names the model compares against.
 */
export function dbH2H(match: Match, limit = 10): Promise<ResultRow[]> {
  const pair = [match.home.name, match.away.name];
  return cached(`db:h2h:${pair.join("|")}`, 60 * 60_000, async () => {
    const { canonicaliseRows, nameBook, nameScope, looseKey } = await import("@/lib/teams/canonical");
    const def = match.league.code ? leagueByCode(match.league.code) : undefined;
    const scope = def ? nameScope(def) : null;
    const book = scope ? await nameBook(scope) : null;
    // A feed may name the fixture's clubs its own way too; find the canonical name first.
    const canon = pair.map((n) => book?.canonical.get(looseKey(n)) ?? n);
    const names = [...new Set(canon.flatMap((n) => book?.spellings.get(n) ?? [n]))];
    const c = await client();
    const { data, error } = await c.from("historical_results")
      .select("league_code, kickoff, home_name, away_name, home_goals, away_goals")
      .in("home_name", names).in("away_name", names)
      .order("kickoff", { ascending: false })
      .limit(limit * 3);
    if (error) throw error;
    const rows: ResultRow[] = (data ?? []).map((r) => ({
      homeId: r.home_name as string, awayId: r.away_name as string,
      homeName: r.home_name as string, awayName: r.away_name as string,
      homeGoals: r.home_goals as number, awayGoals: r.away_goals as number,
      date: Date.parse(r.kickoff as string), leagueId: r.league_code as string,
    }));
    const canonical = book ? canonicaliseRows(rows, book) : rows;
    const keys = new Set(canon.map(looseKey));
    return canonical
      .filter((r) => r.homeName !== r.awayName && keys.has(looseKey(r.homeName)) && keys.has(looseKey(r.awayName)))
      .slice(0, limit);
  });
}
