import "server-only";

import type { Match } from "@/lib/types";
import { getUpcoming } from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { leagueByCode } from "@/lib/leagues";
import { findStreaks, type Streak, type StreakKind, type TeamResult } from "./compute";
import { isTeamId, recentResults } from "./queries";

export interface StreakTrend {
  id: string;
  team: { id: string; name: string; crest?: string };
  /** The club's next game, which is why the streak matters now. */
  fixture: { id: string; opponent: string; opponentCrest?: string; home: boolean; kickoff: string; league: string };
  streak: Streak;
  /** Did each of the last games pass the streak's test? Most recent first. */
  hits: boolean[];
}

const TEST: Record<StreakKind, (r: TeamResult) => boolean> = {
  winning: (r) => r.goalsFor > r.goalsAgainst,
  unbeaten: (r) => r.goalsFor >= r.goalsAgainst,
  losing: (r) => r.goalsFor < r.goalsAgainst,
  winless: (r) => r.goalsFor <= r.goalsAgainst,
  over25: (r) => r.goalsFor + r.goalsAgainst > 2.5,
  btts: (r) => r.goalsFor > 0 && r.goalsAgainst > 0,
  cleanSheets: (r) => r.goalsAgainst === 0,
  noGoals: (r) => r.goalsFor === 0,
};

/**
 * The streaks worth knowing before this weekend: every club with a game in
 * the next few days, its last ten finished games in any competition, and
 * the runs that stand out (findStreaks ranks them by how unlikely they are).
 * At most two per club so one team on a tear doesn't fill the page.
 */
export function streakTrends(days = 3): Promise<StreakTrend[]> {
  return cached(`stats:streaks:${days}`, 10 * 60_000, async () => {
    const upcoming = (await getUpcoming(days).catch(() => [] as Match[])).filter(
      (m) => m.status === "scheduled" && m.league.code && leagueByCode(m.league.code),
    );
    const next = new Map<string, { match: Match; home: boolean }>();
    for (const m of [...upcoming].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))) {
      if (isTeamId(m.home.id) && !next.has(m.home.id)) next.set(m.home.id, { match: m, home: true });
      if (isTeamId(m.away.id) && !next.has(m.away.id)) next.set(m.away.id, { match: m, home: false });
    }
    const recent = await recentResults([...next.keys()], 10);

    const out: StreakTrend[] = [];
    for (const [teamId, { match, home }] of next) {
      const results = recent.get(teamId) ?? [];
      if (results.length < 5) continue;
      const team = home ? match.home : match.away;
      const opp = home ? match.away : match.home;
      const streaks = findStreaks(results).sort((a, b) => b.strength - a.strength).slice(0, 2);
      for (const s of streaks) {
        out.push({
          id: `${teamId}:${s.kind}`,
          team: { id: teamId, name: team.name, crest: team.crest },
          fixture: {
            id: match.id,
            opponent: opp.name,
            opponentCrest: opp.crest,
            home,
            kickoff: match.kickoff,
            league: leagueByCode(match.league.code!)?.shortName ?? match.league.name,
          },
          streak: s,
          hits: results.slice(0, s.consecutive ? Math.max(s.run + 1, 6) : s.of).map(TEST[s.kind]),
        });
      }
    }
    return out.sort((a, b) => b.streak.strength - a.streak.strength).slice(0, 48);
  });
}
