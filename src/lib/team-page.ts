import "server-only";

import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";
import { publicMatchId } from "@/lib/providers/db-source";
import { switchOn } from "@/lib/switches";
import { goalProfile, ratingScore, summariseForm, type FormSummary, type GoalProfile, type TeamResult } from "@/lib/stats/compute";
import { ratingScope } from "@/lib/stats/leagues";
import { liveLeagueTable, type LiveTable } from "@/lib/stats/live-table";
import { latestRatings, recentResults, searchTeams, teamsById, type TeamRef } from "@/lib/stats/queries";
import { mapLeaders, mapProfile, primaryLeague, seasonStart, teamSlug, type Leader, type TeamProfile } from "./team-page-core";

export { teamSegment, parseTeamSegment, teamSlug } from "./team-page-core";

/**
 * Everything a club's page shows, from our own database: its games and form,
 * its league table, its rating, and (from FotMob, migration 0091) its squad,
 * coach, venue, transfers, honours and this season's leaders. Each part fails
 * on its own; a club with no FotMob profile still has a page built from its
 * games.
 */

export interface TeamFixture {
  publicId: string;
  leagueCode: string;
  leagueName: string;
  kickoff: string;
  status: string;
  isHome: boolean;
  opponentId: string;
  opponentName: string;
  opponentCrest: string | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface TeamPage {
  team: TeamRef;
  league: LeagueDef | null;
  form: FormSummary | null;
  goals: GoalProfile | null;
  recent: TeamResult[];
  results: TeamFixture[];
  upcoming: TeamFixture[];
  table: LiveTable | null;
  position: number | null;
  rating: number | null;
  profile: TeamProfile | null;
  leaders: Leader[];
}

async function client() {
  const { supabasePublic } = await import("@/lib/supabase/public");
  const c = supabasePublic();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

interface FixtureRow {
  id: string;
  league_code: string;
  kickoff: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
  home_crest: string | null;
  away_crest: string | null;
  home_goals: number | null;
  away_goals: number | null;
  source_ids: Record<string, string> | null;
}

function teamFixtures(teamId: string): Promise<TeamFixture[]> {
  return cached(`team:fixtures:${teamId}`, 5 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.rpc("team_fixtures", { p_team: teamId, p_past: 20, p_future: 8 });
    if (error) throw error;
    return ((data ?? []) as FixtureRow[]).map((r) => {
      const isHome = r.home_team_id === teamId;
      return {
        publicId: publicMatchId({ id: r.id, source_ids: r.source_ids }),
        leagueCode: r.league_code,
        leagueName: leagueByCode(r.league_code)?.shortName ?? r.league_code,
        kickoff: r.kickoff,
        status: r.status,
        isHome,
        opponentId: isHome ? r.away_team_id : r.home_team_id,
        opponentName: isHome ? r.away_name : r.home_name,
        opponentCrest: isHome ? r.away_crest : r.home_crest,
        goalsFor: isHome ? r.home_goals : r.away_goals,
        goalsAgainst: isHome ? r.away_goals : r.home_goals,
      };
    });
  });
}

function profile(teamId: string): Promise<TeamProfile | null> {
  return cached(`team:profile:${teamId}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.rpc("team_profile", { p_team: teamId });
    if (error) throw error;
    return mapProfile(data);
  });
}

function leaders(teamId: string): Promise<Leader[]> {
  const since = seasonStart().toISOString();
  return cached(`team:leaders:${teamId}:${since.slice(0, 10)}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.rpc("team_season_leaders", { p_team: teamId, p_since: since });
    if (error) throw error;
    return mapLeaders(data);
  });
}

export async function teamPage(teamId: string): Promise<TeamPage | null> {
  const [team] = await teamsById([teamId]).catch(() => [] as TeamRef[]);
  if (!team) return null;

  const showFotmob = await switchOn("fotmob_ui").catch(() => true);
  const [fixtures, recentMap, prof, lead] = await Promise.all([
    teamFixtures(team.id).catch(() => [] as TeamFixture[]),
    recentResults([team.id], 10).catch(() => new Map<string, TeamResult[]>()),
    showFotmob ? profile(team.id).catch(() => null) : Promise.resolve(null),
    showFotmob ? leaders(team.id).catch(() => [] as Leader[]) : Promise.resolve([] as Leader[]),
  ]);

  const recent = recentMap.get(team.id) ?? [];
  const league = primaryLeague(
    [...fixtures.map((f) => f.leagueCode), ...recent.map((r) => r.leagueCode)],
    leagueByCode,
  );
  const [table, ratings] = await Promise.all([
    league && !league.knockout && !league.confederation ? liveLeagueTable(league.code).catch(() => null) : Promise.resolve(null),
    league ? latestRatings(ratingScope(league)).catch(() => []) : Promise.resolve([]),
  ]);
  const position = table?.rows.find((r) => r.team.id === team.id)?.position ?? null;
  const r = ratings.find((x) => x.teamId === team.id);

  return {
    team,
    league,
    form: recent.length ? summariseForm(recent) : null,
    goals: recent.length ? goalProfile(recent) : null,
    recent,
    results: fixtures.filter((f) => f.status === "finished"),
    upcoming: fixtures.filter((f) => f.status !== "finished").sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    table: table && table.rows.length ? table : null,
    position,
    rating: r ? ratingScore(r.rating) : null,
    profile: prof,
    leaders: lead,
  };
}

/**
 * A club id that no longer exists (merged into another by merge_team) found
 * again from the readable part of its URL, when exactly one club matches.
 */
export async function teamBySlug(slug: string): Promise<TeamRef | null> {
  const words = slug.replace(/-/g, " ").trim();
  if (words.length < 3) return null;
  const hits = await searchTeams(words, 5).catch(() => [] as TeamRef[]);
  const exact = hits.filter((t) => teamSlug(t.name) === slug);
  return exact.length === 1 ? exact[0] : null;
}
