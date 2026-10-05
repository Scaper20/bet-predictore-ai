import "server-only";

import { getLive } from "@/lib/providers";
import { applyLiveScores, type LiveStandingRow } from "./compute";
import { leagueTable } from "./queries";

export interface LiveTable {
  code: string;
  season: string | null;
  updatedAt: string | null;
  rows: LiveStandingRow[];
  /** Games in this competition in play right now. */
  liveGames: number;
}

/**
 * A competition's table with the games in play folded in, so it moves as
 * goals go in. The official standings come from the scheduled tables job;
 * the scores in play from the live feed (the same one the Live page polls,
 * cached for seconds).
 */
export async function liveLeagueTable(code: string): Promise<LiveTable> {
  const [table, live] = await Promise.all([leagueTable(code), getLive().catch(() => [])]);
  const inLeague = live.filter((m) => m.league.code === code);
  return {
    code,
    season: table.season,
    updatedAt: table.updatedAt,
    rows: applyLiveScores(table.rows, inLeague),
    liveGames: inLeague.length,
  };
}
