import "server-only";

import type { Match } from "@/lib/types";
import { leagueByCode } from "@/lib/leagues";
import { ratingScope } from "./leagues";
import { goalProfile, ratingScore, summariseForm } from "./compute";
import { isTeamId, latestRatings, recentResults, teamIdByName } from "./queries";
import { liveLeagueTable, type LiveTable } from "./live-table";
import type { SideStats } from "@/components/match/match-stats";

export interface MatchContext {
  teamIds: { home: string | null; away: string | null };
  home: SideStats | null;
  away: SideStats | null;
  table: LiveTable | null;
}

/**
 * Everything the match page's Stats and Table tabs show, from the database:
 * both clubs' last ten games, their 1-10 ratings and the live league table.
 * Each part fails on its own; a page never errors because one is missing.
 */
export async function matchContext(match: Match): Promise<MatchContext> {
  const def = match.league.code ? leagueByCode(match.league.code) : undefined;
  const resolve = async (t: Match["home"]) => (isTeamId(t.id) ? t.id : await teamIdByName(t.name).catch(() => null));
  const [homeId, awayId] = await Promise.all([resolve(match.home), resolve(match.away)]);
  const ids = [homeId, awayId].filter((x): x is string => Boolean(x));

  const [recent, ratings, table] = await Promise.all([
    recentResults(ids, 10).catch(() => new Map()),
    def ? latestRatings(ratingScope(def)).catch(() => []) : Promise.resolve([]),
    def && !def.confederation ? liveLeagueTable(def.code).catch(() => null) : Promise.resolve(null),
  ]);

  const side = (id: string | null): SideStats | null => {
    if (!id) return null;
    const results = recent.get(id) ?? [];
    const r = ratings.find((x) => x.teamId === id);
    if (results.length === 0 && !r) return null;
    return { results, form: summariseForm(results), goals: goalProfile(results), rating: r ? ratingScore(r.rating) : null };
  };

  return {
    teamIds: { home: homeId, away: awayId },
    home: side(homeId),
    away: side(awayId),
    table: table && table.rows.length > 0 ? table : null,
  };
}
