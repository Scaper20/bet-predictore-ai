import "server-only";

import { cached } from "@/lib/providers/cache";
import { espnDay, espnStatsComplete, findEspnGame, type EspnResult } from "@/lib/archive/espn-shots";
import { leagueByCode } from "@/lib/leagues";
import { evaluateStatPick, statKindOf, type PickResult } from "@/lib/settlement";
import type { Match } from "@/lib/types";

/**
 * Grades for corners, shots and shots-on-target picks straight after full
 * time, from ESPN's scoreboard, which has the counts within minutes. The
 * archive (football-data.co.uk) that the daily sweep waits for takes two to
 * five days.
 *
 * ESPN's counts are taken as final, close calls included, the same rule
 * settlement uses (settlement-runner.ts gradeFromStats), so the page and the
 * record cannot disagree.
 */

export type StatCounts = Record<"corners" | "shots" | "shotsOnTarget", [number, number]>;

/** One competition-day from ESPN, shared for five minutes; an empty answer is retried sooner. */
function day(slug: string, d: Date): Promise<EspnResult[]> {
  const key = `espn-day:${slug}:${d.toISOString().slice(0, 10)}`;
  return cached(key, 5 * 60_000, () => espnDay(slug, d)).catch(() => []);
}

/** A finished match's corners and shots counts from ESPN, when they are complete; null otherwise. */
export async function espnCountsFor(
  m: Pick<Match, "kickoff" | "home" | "away" | "score" | "league">,
): Promise<StatCounts | null> {
  const slug = m.league.code ? leagueByCode(m.league.code)?.ids.espn : undefined;
  if (!slug || m.score.home === null || m.score.away === null) return null;
  const at = Date.parse(m.kickoff);
  // ESPN dates games by US time, so a late kick-off can sit on the day before.
  const games = (await Promise.all([day(slug, new Date(at)), day(slug, new Date(at - 86_400_000))])).flat();
  const g = findEspnGame(games, { home: m.home.name, away: m.away.name, kickoff: at, hg: m.score.home, ag: m.score.away });
  if (!g || !espnStatsComplete(g)) return null;
  return { corners: [g.hc!, g.ac!], shots: [g.hs!, g.as!], shotsOnTarget: [g.hsot!, g.asot!] };
}

/** A stat pick's grade from ESPN's counts. */
export function statOutcome(market: string, counts: StatCounts | null): PickResult | null {
  const kind = statKindOf(market);
  if (!kind || !counts) return null;
  const [h, a] = counts[kind];
  return evaluateStatPick(market, h, a);
}

/** Fills in the outcome of any stat pick on a finished match that has none yet. */
export async function withStatOutcomes<T extends { market: string; outcome?: PickResult }>(
  picks: T[],
  m: Pick<Match, "kickoff" | "home" | "away" | "score" | "league" | "status">,
): Promise<T[]> {
  if (m.status !== "finished" || !picks.some((p) => !p.outcome && statKindOf(p.market))) return picks;
  const counts = await espnCountsFor(m).catch(() => null);
  if (!counts) return picks;
  return picks.map((p) => {
    if (p.outcome || !statKindOf(p.market)) return p;
    const outcome = statOutcome(p.market, counts);
    return outcome ? { ...p, outcome } : p;
  });
}
