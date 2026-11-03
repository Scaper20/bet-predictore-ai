import "server-only";

import { leagueByCode } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";
import { publicMatchId } from "@/lib/providers/db-source";
import { switchOn } from "@/lib/switches";
import type { ShotPoint } from "./match-details-core";
import {
  hitRates,
  mapGameLog,
  mapHeader,
  mapPeers,
  mapPlayerShots,
  percentiles,
  PERCENTILE_STATS,
  seasonLines,
  type GameRow,
  type HitRate,
  type PlayerHeader,
  type SeasonLine,
} from "./player-page-core";
import { seasonStart, teamSlug } from "./team-page-core";

export { parseTeamSegment as parsePlayerSegment } from "./team-page-core";

/**
 * Everything a player's page shows, from our own database (FotMob data,
 * migrations 0091 and 0093): who they are, every game we hold, this season by
 * competition, percentiles against players in the same position, their shot
 * map and how often they cleared common lines. Each part fails on its own.
 */

export interface PlayerFixture {
  publicId: string;
  kickoff: string;
  leagueName: string;
  opponentName: string;
  opponentCrest: string | null;
  isHome: boolean;
}

export interface PlayerPage {
  player: PlayerHeader;
  games: (GameRow & { publicId: string; leagueName: string })[];
  season: SeasonLine[];
  percentiles: { key: string; label: string; value: number }[] | null;
  peersLabel: string | null;
  shots: ShotPoint[];
  hitRates: HitRate[];
  next: PlayerFixture | null;
}

async function client() {
  const { supabasePublic } = await import("@/lib/supabase/public");
  const c = supabasePublic();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = await client();
  const { data, error } = await c.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function peers(position: number, since: string) {
  return cached(`player:peers:${position}:${since.slice(0, 10)}`, 6 * 60 * 60_000, async () =>
    mapPeers(await rpc("position_peer_rates", { p_position: position, p_since: since, p_min_minutes: 900 })),
  );
}

interface FixtureRow {
  id: string;
  league_code: string;
  kickoff: string;
  status: string;
  home_team_id: string;
  home_name: string;
  away_name: string;
  home_crest: string | null;
  away_crest: string | null;
  source_ids: Record<string, string> | null;
}

async function nextFixture(teamId: string): Promise<PlayerFixture | null> {
  const rows = await cached(`team:fixtures:${teamId}`, 5 * 60_000, () => rpc<FixtureRow[]>("team_fixtures", { p_team: teamId, p_past: 20, p_future: 8 }));
  const next = (rows ?? []).filter((r) => r.status !== "finished").sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  if (!next) return null;
  const isHome = next.home_team_id === teamId;
  return {
    publicId: publicMatchId({ id: next.id, source_ids: next.source_ids }),
    kickoff: next.kickoff,
    leagueName: leagueByCode(next.league_code)?.shortName ?? next.league_code,
    opponentName: isHome ? next.away_name : next.home_name,
    opponentCrest: isHome ? next.away_crest : next.home_crest,
    isHome,
  };
}

export async function playerPage(playerId: string): Promise<PlayerPage | null> {
  if (!(await switchOn("fotmob_ui").catch(() => true))) return null;
  const header = await cached(`player:header:${playerId}`, 30 * 60_000, async () =>
    mapHeader(await rpc("player_page", { p_player: playerId })),
  ).catch(() => null);
  if (!header) return null;

  const since = seasonStart().toISOString();
  // Peers over a rolling year, not this season: early in a season too few
  // players have 900 minutes for a percentile to mean much.
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z";
  const [games, shots, pool, next] = await Promise.all([
    cached(`player:games:${playerId}`, 30 * 60_000, async () => mapGameLog(await rpc("player_game_log", { p_player: playerId, p_limit: 120 }))).catch(() => [] as GameRow[]),
    cached(`player:shots:${playerId}:${since.slice(0, 10)}`, 30 * 60_000, async () =>
      mapPlayerShots(await rpc("player_shots", { p_player: playerId, p_since: since }), header.name),
    ).catch(() => [] as ShotPoint[]),
    header.usualPosition !== null ? peers(header.usualPosition, yearAgo).catch(() => []) : Promise.resolve([]),
    header.team ? nextFixture(header.team.id).catch(() => null) : Promise.resolve(null),
  ]);

  const stats = header.group ? PERCENTILE_STATS[header.group] : [];
  const pct = header.group ? percentiles(header.id, pool, stats.map((s) => s.key)) : null;

  return {
    player: header,
    games: games.map((g) => ({
      ...g,
      publicId: publicMatchId({ id: g.matchId, source_ids: g.sourceIds }),
      leagueName: leagueByCode(g.leagueCode)?.shortName ?? g.leagueCode,
    })),
    season: seasonLines(games, new Date(since)),
    percentiles: pct ? stats.map((s) => ({ ...s, value: pct[s.key] ?? 0 })) : null,
    peersLabel: pct ? `${pool.length} ${header.group}s with 900+ minutes in the last 12 months` : null,
    shots,
    hitRates: hitRates(games),
    next,
  };
}

/** Players by name, for the header search. */
export function searchPlayers(q: string): Promise<{ id: string; name: string; teamName: string | null; position: string | null }[]> {
  const term = q.trim().slice(0, 40);
  if (term.length < 2) return Promise.resolve([]);
  return cached(`player:search:${term.toLowerCase()}`, 10 * 60_000, async () => {
    const rows = await rpc<{ id: string; name: string; team_name: string | null; position_short: string | null }[]>("search_players", { p_q: term });
    return (rows ?? []).map((r) => ({ id: r.id, name: r.name, teamName: r.team_name, position: r.position_short }));
  });
}

/** Our player ids for FotMob ids (club squads link only to players we hold). */
export function playerIdsByFotmob(ids: number[]): Promise<Map<number, string>> {
  const list = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, 80);
  if (list.length === 0) return Promise.resolve(new Map());
  return cached(`player:ids:${list.join(",")}`, 60 * 60_000, async () => {
    const rows = await rpc<{ fotmob_id: number; id: string }[]>("player_ids_by_fotmob", { p_ids: list });
    return new Map((rows ?? []).map((r) => [Number(r.fotmob_id), r.id]));
  });
}

export function playerSlug(name: string): string {
  return teamSlug(name);
}
