import "server-only";

import { LEAGUES, leagueByCode } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";
import { publicMatchId } from "@/lib/providers/db-source";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { switchOn } from "@/lib/switches";
import type { PropMarketKey } from "@/lib/model/player-props";
import type { LadderRung, PropRisk } from "@/lib/model/prop-picks";
import type { PropRow } from "@/lib/props-view";

/**
 * Player props for pages: projections (migration 0094) joined to players,
 * clubs and games, with the published pick where there is one. Rows are
 * system-owned and read with the service client on the server (the tables
 * are closed to the Data API); callers pass them through viewProps before
 * anything reaches a browser.
 */

const FOTMOB_CODES = LEAGUES.filter((l) => l.ids.fotMob).map((l) => l.code);
const TTL = 2 * 60_000;

interface GameRow {
  id: string;
  source_ids: Record<string, string> | null;
  kickoff: string;
  league_code: string;
  home_name: string;
  away_name: string;
}

interface ProjectionRow {
  match_id: string;
  player_id: string;
  market: PropMarketKey;
  team_id: string | null;
  position: number | null;
  lineup: "confirmed" | "predicted";
  mean: number;
  ladder: { rungs?: LadderRung[]; recent?: number[] } | null;
  players: { name: string } | null;
  teams: { name: string; crest: string | null } | null;
}

interface PickRow {
  match_id: string;
  player_id: string;
  market: PropMarketKey;
  line: number;
  side: "over" | "under";
  probability: number;
  market_probability: number | null;
  price: number | null;
  risk: PropRisk;
  selection: string | null;
  published: boolean;
}

async function load(games: GameRow[], playerId?: string): Promise<PropRow[]> {
  if (games.length === 0) return [];
  const admin = supabaseAdmin();
  const ids = games.map((g) => g.id);
  let pq = admin
    .from("player_prop_projections")
    .select("match_id, player_id, market, team_id, position, lineup, mean, ladder, players(name), teams(name, crest)")
    .in("match_id", ids)
    .limit(10_000);
  if (playerId) pq = pq.eq("player_id", playerId);
  let kq = admin
    .from("player_prop_picks")
    .select("match_id, player_id, market, line, side, probability, market_probability, price, risk, selection, published")
    .in("match_id", ids)
    .eq("published", true)
    .limit(2_000);
  if (playerId) kq = kq.eq("player_id", playerId);
  const [{ data: projections, error }, { data: picks }, { data: links }] = await Promise.all([
    pq,
    kq,
    admin.from("sportybet_event_links").select("match_id, event_id").in("match_id", games.map((g) => publicMatchId(g))),
  ]);
  const eventBy = new Map((links ?? []).map((l) => [l.match_id as string, l.event_id as string]));
  if (error) throw error;
  const pickBy = new Map((picks as PickRow[] | null ?? []).map((p) => [`${p.match_id}|${p.player_id}|${p.market}`, p]));
  const gameBy = new Map(games.map((g) => [g.id, g]));
  const out: PropRow[] = [];
  for (const r of (projections ?? []) as unknown as ProjectionRow[]) {
    const g = gameBy.get(r.match_id);
    if (!g || !r.players) continue;
    const pick = pickBy.get(`${r.match_id}|${r.player_id}|${r.market}`) ?? null;
    const rungs = Array.isArray(r.ladder?.rungs) ? r.ladder!.rungs! : [];
    const teamName = r.teams?.name ?? "";
    out.push({
      matchId: g.id, publicId: publicMatchId(g), kickoff: g.kickoff, leagueCode: g.league_code,
      leagueName: leagueByCode(g.league_code)?.shortName ?? g.league_code, homeName: g.home_name, awayName: g.away_name,
      eventId: eventBy.get(publicMatchId(g)) ?? null,
      playerId: r.player_id, playerName: r.players.name, teamId: r.team_id, teamName, teamCrest: r.teams?.crest ?? null,
      position: r.position, lineup: r.lineup, market: r.market, mean: Number(r.mean),
      rungs, recent: Array.isArray(r.ladder?.recent) ? r.ladder!.recent!.map(Number) : [],
      pick: pick ? {
        line: Number(pick.line), side: pick.side, probability: Number(pick.probability),
        marketProbability: pick.market_probability === null ? null : Number(pick.market_probability),
        price: pick.price === null ? null : Number(pick.price), risk: pick.risk, selection: pick.selection, published: pick.published,
      } : null,
      hasPick: Boolean(pick),
      bookable: rungs.some((x) => x.overPrice !== null || x.underPrice !== null),
      locked: false,
    });
  }
  return out;
}

function upcomingGames(): Promise<GameRow[]> {
  return cached("props:games", TTL, async () => {
    const now = Date.now();
    const { data, error } = await supabaseAdmin()
      .from("matches")
      .select("id, source_ids, kickoff, league_code, home_name, away_name")
      .gt("kickoff", new Date(now - 2 * 3_600_000).toISOString())
      .lte("kickoff", new Date(now + 36 * 3_600_000).toISOString())
      .in("league_code", FOTMOB_CODES)
      .order("kickoff")
      .limit(80);
    if (error) throw error;
    return (data ?? []) as GameRow[];
  });
}

/** Every projection in the next 36 hours (unredacted: pass through viewProps). */
export function propsBoardRows(): Promise<PropRow[]> {
  return cached("props:board", TTL, async () => load(await upcomingGames()));
}

/** One game's props. */
export function matchPropRows(matchId: string): Promise<PropRow[]> {
  return cached(`props:match:${matchId}`, TTL, async () => {
    const { data } = await supabaseAdmin()
      .from("matches")
      .select("id, source_ids, kickoff, league_code, home_name, away_name")
      .eq("id", matchId)
      .maybeSingle();
    return data ? load([data as GameRow]) : [];
  });
}

/** One player's props for his next game in the window. */
export function playerPropRows(playerId: string): Promise<PropRow[]> {
  return cached(`props:player:${playerId}`, TTL, async () => {
    const rows = await load(await upcomingGames(), playerId);
    const first = rows.reduce<string | null>((m, r) => (m === null || r.kickoff < m ? r.kickoff : m), null);
    return rows.filter((r) => r.kickoff === first);
  });
}

export interface PropRecordLine {
  market: PropMarketKey;
  picks: number;
  won: number;
  stated: number | null;
}

/** The published track record per market (public). */
export function propRecord(): Promise<PropRecordLine[]> {
  return cached("props:record", 10 * 60_000, async () => {
    const { data, error } = await supabaseAdmin().rpc("player_prop_record");
    if (error) throw error;
    return ((data ?? []) as { market: PropMarketKey; picks: number; won: number; stated: number | null }[])
      .map((r) => ({ market: r.market, picks: Number(r.picks), won: Number(r.won), stated: r.stated === null ? null : Number(r.stated) }));
  });
}

/** Whether props are published (switch) — the board says "shadow" otherwise. */
export function propsLive(): Promise<boolean> {
  return switchOn("player_props").catch(() => false);
}
