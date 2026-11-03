/**
 * Research only: export every player-game the props backtest needs, through
 * the same public, bounded RPCs the site reads (no service key, no writes).
 *
 *   clubs     league_teams for each competition with FotMob match details,
 *             then (one more pass) every opponent those players met
 *   players   team_season_leaders(club, since 2023-07-01), 3+ appearances
 *   games     player_game_log(player, 120): the player's last 120 games
 *   position  position_peer_rates(0..3, since, 300 min): usual position
 *
 * Output: .backtest-cache/props-games.json, one compact row per player-game.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/props-export.ts
 * (needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { LEAGUES } from "../src/lib/leagues";

const CACHE = path.join(process.cwd(), ".backtest-cache");
const SINCE = "2023-07-01T00:00:00Z";
const MIN_APPS = 3;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false } });

async function rpc<T>(fn: string, args: Record<string, unknown>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    const { data, error } = await db.rpc(fn, args);
    if (!error) return data as T;
    if (i >= tries) throw new Error(`${fn}: ${error.message}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
}

async function pool<I, O>(items: I[], n: number, f: (x: I) => Promise<O>, label: string): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]);
      if (++done % 250 === 0) console.log(`  ${label}: ${done}/${items.length}`);
    }
  }));
  return out;
}

interface LogRow {
  match_id: string; kickoff: string; league_code: string; side: string; team_id: string; opponent_id: string;
  goals_for: number | null; goals_against: number | null; role: string | null; minutes: number | null;
  goals: number | null; assists: number | null; shots: number | null; shots_on_target: number | null;
  xg: number | null; xa: number | null; tackles: number | null; clearances: number | null;
  fouls_committed: number | null; fouls_won: number | null; passes_attempted: number | null; saves: number | null;
  is_goalkeeper: boolean | null; rating: number | null;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const comps = LEAGUES.filter((l) => l.ids.fotMob);
  const clubs = new Set<string>();
  for (const l of comps) {
    const rows = await rpc<{ team_id: string }[]>("league_teams", { p_league: l.code });
    for (const r of rows ?? []) clubs.add(r.team_id);
  }
  console.log(`clubs: ${clubs.size}`);

  const players = new Set<string>();
  const leaders = async (ids: string[]) => {
    const lists = await pool(ids, 8, (id) => rpc<{ player_id: string; apps: number }[]>("team_season_leaders", { p_team: id, p_since: SINCE }).catch(() => []), "clubs");
    for (const list of lists) for (const p of list ?? []) if (p.apps >= MIN_APPS) players.add(p.player_id);
  };
  await leaders([...clubs]);
  console.log(`players (pass 1): ${players.size}`);

  const logs = new Map<string, LogRow[]>();
  const fetchLogs = async (ids: string[]) => {
    const got = await pool(ids, 10, (id) => rpc<LogRow[]>("player_game_log", { p_player: id, p_limit: 120 }).catch(() => [] as LogRow[]), "players");
    ids.forEach((id, i) => logs.set(id, got[i] ?? []));
  };
  await fetchLogs([...players]);

  // Second pass: clubs met along the way (relegated sides, other leagues in Europe).
  const more = new Set<string>();
  for (const rows of logs.values()) for (const r of rows) for (const t of [r.team_id, r.opponent_id]) if (t && !clubs.has(t)) more.add(t);
  console.log(`more clubs: ${more.size}`);
  for (const t of more) clubs.add(t);
  const before = new Set(players);
  await leaders([...more]);
  await fetchLogs([...players].filter((p) => !before.has(p)));
  console.log(`players: ${players.size}`);

  const position = new Map<string, number>();
  // The API returns at most 1,000 rows per call, so page through each position.
  for (const pos of [0, 1, 2, 3]) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .rpc("position_peer_rates", { p_position: pos, p_since: SINCE, p_min_minutes: 300 })
        .range(from, from + 999);
      if (error) throw new Error(`position_peer_rates: ${error.message}`);
      const rows = (data ?? []) as { player_id: string }[];
      for (const r of rows) position.set(r.player_id, pos);
      if (rows.length < 1000) break;
    }
  }

  const out: unknown[] = [];
  const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
  for (const [pid, rows] of logs) {
    for (const r of rows) {
      if (!r.minutes || r.minutes <= 0) continue;
      out.push({
        p: pid, pos: r.is_goalkeeper ? 0 : position.get(pid) ?? null, m: r.match_id, t: Date.parse(r.kickoff), lg: r.league_code,
        h: r.side === "home" ? 1 : 0, tm: r.team_id, op: r.opponent_id, gf: r.goals_for, ga: r.goals_against,
        st: r.role === "starter" ? 1 : 0, min: r.minutes, rt: n(r.rating),
        g: n(r.goals) ?? 0, a: n(r.assists) ?? 0, sh: n(r.shots) ?? 0, sot: n(r.shots_on_target) ?? 0,
        xg: n(r.xg), xa: n(r.xa), tk: n(r.tackles), cl: n(r.clearances), fc: n(r.fouls_committed), fw: n(r.fouls_won),
        pa: n(r.passes_attempted), sv: n(r.saves),
      });
    }
  }
  const file = path.join(CACHE, "props-games.json");
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`wrote ${out.length} player-games to ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
