import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { playerUuid, type MatchBundle } from "./parse";

/**
 * Writes one FotMob game: the TypeScript twin of `write_match` and
 * `snapshot_prematch` in ingestion/betrix_ingest/fotmob_writer.py, table for
 * table, so a game the live lane fetched looks exactly like one the Python
 * job fetched. `match_details` goes last: a run that dies part way leaves the
 * game looking unfetched, and the next run fetches it again.
 */

type Admin = SupabaseClient;

async function must<T>(p: PromiseLike<{ error: { message: string } | null; data?: T }>, what: string): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}

function chunks<T>(xs: T[], n = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const now = () => new Date().toISOString();

export async function writeMatch(admin: Admin, matchId: string, b: MatchBundle): Promise<number> {
  let n = 0;
  const players = [...b.players.values()].map((p) => ({
    id: playerUuid(p.fotmobId), fotmob_id: p.fotmobId, name: p.name,
    first_name: p.firstName, last_name: p.lastName, country_code: p.countryCode,
    usual_position: p.usualPosition, fotmob_team_id: p.fotmobTeamId, updated_at: now(),
  }));
  for (const c of chunks(players)) await must(admin.from("players").upsert(c, { onConflict: "fotmob_id" }), "players");
  n += players.length;

  const lineups = Object.entries(b.lineups).map(([side, cols]) => ({ match_id: matchId, side, ...cols }));
  if (lineups.length) {
    await must(admin.from("match_lineups").upsert(lineups, { onConflict: "match_id,side" }), "match_lineups");
    n += lineups.length;
  }

  if (b.lineupRows.length) {
    if (b.started) {
      // Keep who was out as known before kickoff; replace the XI and the bench.
      await must(admin.from("match_lineup_players").delete().eq("match_id", matchId).in("role", ["starter", "sub"]), "lineup delete");
    } else {
      await must(admin.from("match_lineup_players").delete().eq("match_id", matchId), "lineup delete");
    }
    const rows = new Map<number, Record<string, unknown>>();
    for (const r of b.lineupRows) {
      rows.set(r.fotmobPlayerId, {
        match_id: matchId, player_id: playerUuid(r.fotmobPlayerId), side: r.side, role: r.role,
        shirt: r.shirt, position_id: r.positionId, usual_position: r.usualPosition,
        pitch_x: r.pitchX, pitch_y: r.pitchY, rating: r.rating, minutes: r.minutes,
        sub_in: r.subIn, sub_out: r.subOut, is_captain: r.isCaptain, age: r.age,
        absence_kind: r.absenceKind, expected_return: r.expectedReturn,
      });
    }
    await must(admin.from("match_lineup_players").upsert([...rows.values()], { onConflict: "match_id,player_id" }), "match_lineup_players");
    n += rows.size;
  }

  if (b.statRows.length) {
    const rows = b.statRows.map((s) => ({
      match_id: matchId, player_id: playerUuid(s.fotmobPlayerId), side: s.side,
      is_goalkeeper: s.isGoalkeeper, ...s.columns, stats: s.stats,
    }));
    await must(admin.from("player_match_stats").upsert(rows, { onConflict: "match_id,player_id" }), "player_match_stats");
    n += rows.length;
  }

  if (b.shots.length) {
    await must(admin.from("match_shots").delete().eq("match_id", matchId), "shots delete");
    const rows = b.shots.map((s) => ({
      id: s.id, match_id: matchId, side: s.side,
      player_id: s.fotmobPlayerId !== null ? playerUuid(s.fotmobPlayerId) : null, ...s.columns,
    }));
    await must(admin.from("match_shots").upsert(rows, { onConflict: "id" }), "match_shots");
    n += rows.length;
  }

  if (b.events.length) {
    await must(admin.from("match_events").delete().eq("match_id", matchId), "events delete");
    const rows = b.events.map((e) => ({
      match_id: matchId, seq: e.seq, ...e.columns,
      player_id: e.fotmobPlayerId !== null && b.players.has(e.fotmobPlayerId) ? playerUuid(e.fotmobPlayerId) : null,
      related_player_id: e.fotmobRelatedId !== null && b.players.has(e.fotmobRelatedId) ? playerUuid(e.fotmobRelatedId) : null,
    }));
    await must(admin.from("match_events").upsert(rows, { onConflict: "match_id,seq" }), "match_events");
    n += rows.length;
  }

  if (b.teamStats) {
    await must(admin.from("match_team_stats").upsert([{ match_id: matchId, ...b.teamStats.columns, stats: b.teamStats.stats }], { onConflict: "match_id" }), "match_team_stats");
    n += 1;
  }

  // Last: its presence (and finished=true) is what marks the game as done.
  await must(
    admin.from("match_details").upsert([{ match_id: matchId, fotmob_match_id: b.fotmobId, ...b.details, fetched_at: now() }], { onConflict: "match_id" }),
    "match_details",
  );
  return n + 1;
}

/** JSON with sorted keys, for comparing a stored payload with a new one. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Who is out today, and the lineup as it stands: history FotMob does not keep. */
export async function snapshotPrematch(admin: Admin, matchId: string, b: MatchBundle): Promise<number> {
  if (b.started) return 0;
  const day = now().slice(0, 10);
  let n = 0;
  const out = b.lineupRows.filter((r) => r.role === "unavailable");
  if (out.length) {
    await must(admin.from("availability_snapshots").upsert(out.map((r) => ({
      match_id: matchId, player_id: playerUuid(r.fotmobPlayerId), captured_day: day,
      side: r.side, kind: r.absenceKind, expected_return: r.expectedReturn, captured_at: now(),
    })), { onConflict: "match_id,player_id,captured_day" }), "availability_snapshots");
    n += out.length;
  }
  const starters = {
    home: b.lineupRows.filter((r) => r.side === "home" && r.role === "starter").map((r) => r.fotmobPlayerId).sort((x, y) => x - y),
    away: b.lineupRows.filter((r) => r.side === "away" && r.role === "starter").map((r) => r.fotmobPlayerId).sort((x, y) => x - y),
  };
  if (!starters.home.length && !starters.away.length) return n;
  const payload = {
    lineup_type: b.details.lineup_type ?? null,
    formations: { home: b.lineups.home?.formation ?? null, away: b.lineups.away?.formation ?? null },
    starters,
  };
  const { data: prev } = await admin
    .from("prematch_lineup_snapshots").select("payload, captured_at").eq("match_id", matchId)
    .order("captured_at", { ascending: false }).limit(1);
  if (prev?.[0] && canonical(prev[0].payload) === canonical(payload)) return n;
  const minutes = b.kickoff ? Math.floor((Date.parse(b.kickoff) - Date.now()) / 60_000) : null;
  await must(admin.from("prematch_lineup_snapshots").insert({
    match_id: matchId, captured_at: now(), lineup_type: payload.lineup_type, minutes_to_kickoff: minutes, payload,
  }), "prematch_lineup_snapshots");
  return n + 1;
}
