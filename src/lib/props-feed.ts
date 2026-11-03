import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUES } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";
import { allPages } from "@/lib/supabase/pages";
import { publicMatchId } from "@/lib/providers/db-source";
import { switchOn } from "@/lib/switches";
import { fetchEventMarkets } from "@/lib/odds/sportybet-direct";
import { matchPlayer, SPORTYBET_ADAPTER, type PlatformAdapter, type PlayerLine } from "@/lib/odds/player-lines";
import { calibrate, overProb, project, PROP_MARKETS, propValue, type ConcededGame, type PositionCode, type PositionPriors, type PropGame, type PropMarketKey } from "@/lib/model/player-props";
import { PROP_FIT } from "@/lib/model/player-props-params";
import { buildLadder, choosePick } from "@/lib/model/prop-picks";

/**
 * The player-props pipeline, run by /api/cron/player-props (every 15 minutes
 * while there is work; pg_cron, migration 0094):
 *
 *   1. settle picks whose game has FotMob player stats (no appearance = void)
 *   2. for games in the FotMob competitions within 36 hours that have a
 *      lineup (confirmed, or FotMob's predicted eleven): project every
 *      starter in every market, capture the bookmaker's player lines and
 *      match its names to the two squads
 *   3. once the eleven is confirmed and kickoff is under 100 minutes away,
 *      log at most one pick per player and market, always a listed line.
 *      Picks are published only while app_switches.player_props is on;
 *      otherwise they are the shadow record. Frozen at kickoff.
 */

export const PROPS_MODEL_VERSION = "props-1";
const HORIZON_MS = 36 * 3_600_000;
const LOG_WINDOW_MS = 100 * 60_000;
const MAX_MATCHES = 10;
const REFRESH_MS = 45 * 60_000;
const DAY = 86_400_000;
const FOTMOB_CODES = LEAGUES.filter((l) => l.ids.fotMob).map((l) => l.code);

export interface PropsRunReport {
  settled: number;
  matches: number;
  projections: number;
  lines: number;
  /** Bookmaker players not matched to anyone in our lineup rows (mostly reserves it lists and we do not project). */
  unmatched: number;
  /** Starters projected, and how many of them the bookmaker lists lines for. */
  starters: number;
  startersWithLines: number;
  skippedMarkets: number;
  picks: number;
  errors: string[];
}

interface MatchRow {
  id: string;
  source_ids: Record<string, string> | null;
  kickoff: string;
  league_code: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_name?: string;
  away_name?: string;
}

interface LineupRow {
  match_id: string;
  player_id: string;
  side: "home" | "away";
  role: "starter" | "sub" | "unavailable";
  usual_position: number | null;
  players: { name: string; usual_position: number | null } | null;
}

type Admin = SupabaseClient;

function priors(admin: Admin): Promise<PositionPriors> {
  return cached("props:priors", 12 * 3_600_000, async () => {
    const since = new Date(Date.now() - 2 * 365 * DAY).toISOString();
    const { data, error } = await admin.rpc("prop_position_priors", { p_since: since });
    if (error) throw error;
    const out = {} as PositionPriors;
    for (const r of (data ?? []) as Record<string, number>[]) {
      const pos = Number(r.pos) as PositionCode;
      if (![0, 1, 2, 3].includes(pos)) continue;
      const g = Number(r.goals), a = Number(r.assists);
      out[pos] = {
        goals: g, assists: a, goalsAssists: g + a, shots: Number(r.shots), shotsOnTarget: Number(r.shots_on_target),
        tackles: Number(r.tackles), fouls: Number(r.fouls_committed), clearances: Number(r.clearances),
        passes: Number(r.passes_attempted), saves: Number(r.saves), xg: Number(r.xg), xa: Number(r.xa),
      };
    }
    if (![0, 1, 2, 3].every((p) => out[p as PositionCode])) throw new Error("position priors incomplete");
    return out;
  });
}

async function histories(admin: Admin, ids: string[]): Promise<Map<string, PropGame[]>> {
  const since = new Date(Date.now() - 3 * 365 * DAY).toISOString();
  // Twenty-two players' histories run to a few thousand rows: page past the API's 1,000-row cap.
  const data = await allPages<Record<string, unknown>>((from, to) =>
    admin.rpc("prop_game_logs", { p_players: ids.slice(0, 60), p_since: since }).order("kickoff").order("player_id").range(from, to),
  );
  const out = new Map<string, PropGame[]>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const g: PropGame = {
      t: Date.parse(String(r.kickoff)), min: Number(r.minutes) || 0, started: r.started === true,
      g: Number(r.goals) || 0, a: Number(r.assists) || 0, sh: Number(r.shots) || 0, sot: Number(r.shots_on_target) || 0,
      xg: Number(r.xg) || 0, xa: Number(r.xa) || 0, tk: Number(r.tackles) || 0, cl: Number(r.clearances) || 0,
      fc: Number(r.fouls_committed) || 0, pa: Number(r.passes_attempted) || 0, sv: Number(r.saves) || 0,
    };
    const id = String(r.player_id);
    const list = out.get(id);
    if (list) list.push(g); else out.set(id, [g]);
  }
  return out;
}

async function conceded(admin: Admin, teamId: string | null): Promise<Map<number, ConcededGame[]>> {
  const out = new Map<number, ConcededGame[]>();
  if (!teamId) return out;
  const since = new Date(Date.now() - 3 * 365 * DAY).toISOString();
  const rows = await cached(`props:conceded:${teamId}`, 6 * 3_600_000, async () => {
    // Against each player's usual output (0095); the 0094 position-average version until that is applied.
    const expected = await admin.rpc("team_conceded_expected", { p_team: teamId, p_since: since });
    if (!expected.error) return (expected.data ?? []) as Record<string, unknown>[];
    const { data, error } = await admin.rpc("team_conceded_by_position", { p_team: teamId, p_since: since });
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  });
  const counts = (r: Record<string, unknown>, prefix = "") => {
    const n = (k: string) => Number(r[`${prefix}${k}`]) || 0;
    return {
      goals: n("goals"), assists: n("assists"), goalsAssists: n("goals") + n("assists"), shots: n("shots"), shotsOnTarget: n("shots_on_target"),
      tackles: n("tackles"), fouls: n("fouls_committed"), clearances: n("clearances"), passes: n("passes_attempted"), saves: n("saves"),
    };
  };
  for (const r of rows) {
    const pos = Number(r.pos);
    const c: ConcededGame = {
      t: Date.parse(String(r.kickoff)), min: Number(r.minutes) || 0, y: counts(r),
      ...(r.e_passes_attempted !== undefined ? { e: counts(r, "e_") } : {}),
    };
    const list = out.get(pos);
    if (list) list.push(c); else out.set(pos, [c]);
  }
  return out;
}

/** The bookmaker's player lines for one game, matched to our players. */
async function captureLines(
  admin: Admin, adapter: PlatformAdapter, match: MatchRow, squad: { id: string; name: string; team?: string }[], report: PropsRunReport,
): Promise<Map<string, PlayerLine[]>> {
  const byPlayer = new Map<string, PlayerLine[]>();
  const { data: link } = await admin.from("sportybet_event_links").select("event_id").eq("match_id", publicMatchId(match)).maybeSingle();
  if (!link?.event_id) return byPlayer;
  const markets = await fetchEventMarkets(link.event_id).catch(() => null);
  if (!markets) return byPlayer;
  const parsed = adapter.parse(markets);
  report.skippedMarkets += parsed.skipped;
  if (parsed.lines.length === 0) return byPlayer;

  const platformIds = [...new Set(parsed.lines.map((l) => l.playerId).filter((x): x is string => Boolean(x)))];
  const known = new Map<string, string>();
  if (platformIds.length) {
    const { data } = await admin.from("player_aliases").select("platform_player_id, player_id").eq("platform", adapter.platform).in("platform_player_id", platformIds.slice(0, 200));
    for (const a of data ?? []) known.set(a.platform_player_id, a.player_id);
  }
  const learned: { platform: string; platform_player_id: string; player_id: string; platform_name: string; method: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const l of parsed.lines) {
    let playerId = l.playerId ? known.get(l.playerId) ?? null : null;
    if (!playerId) {
      const hit = matchPlayer(l.playerName, squad, l.teamName);
      playerId = hit?.id ?? null;
      if (hit && l.playerId && !known.has(l.playerId)) {
        known.set(l.playerId, hit.id);
        learned.push({ platform: adapter.platform, platform_player_id: l.playerId, player_id: hit.id, platform_name: l.playerName, method: "name" });
      }
    }
    if (!playerId) report.unmatched++;
    else {
      const list = byPlayer.get(`${playerId}|${l.market}`);
      if (list) list.push(l); else byPlayer.set(`${playerId}|${l.market}`, [l]);
    }
    rows.push({
      platform: adapter.platform, match_id: match.id, event_id: link.event_id, market: l.market, platform_market: l.platformMarket,
      specifier: l.specifier.slice(0, 200), line: l.line, platform_player_id: l.playerId, platform_player_name: l.playerName,
      player_id: playerId, over_odds: l.overOdds, under_odds: l.underOdds, over_outcome: l.overOutcome, under_outcome: l.underOutcome,
      captured_at: new Date().toISOString(),
    });
  }
  if (learned.length) await admin.from("player_aliases").upsert(learned, { onConflict: "platform,platform_player_id", ignoreDuplicates: true });
  await admin.from("player_lines").delete().eq("match_id", match.id).eq("platform", adapter.platform);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("player_lines").insert(rows.slice(i, i + 500));
    if (error) report.errors.push(`lines: ${error.message}`);
  }
  report.lines += rows.length;
  return byPlayer;
}

/** Project, capture and (near kickoff) log picks for one game. */
async function runMatch(admin: Admin, match: MatchRow, lineup: LineupRow[], confirmed: boolean, publish: boolean, report: PropsRunReport) {
  const starters = lineup.filter((r) => r.role === "starter");
  const squad = lineup
    .filter((r) => r.role !== "unavailable")
    .map((r) => ({ id: r.player_id, name: r.players?.name ?? "", team: (r.side === "home" ? match.home_name : match.away_name) ?? undefined }))
    .filter((p) => p.name);
  const [pri, hist, homeConc, awayConc] = await Promise.all([
    priors(admin),
    histories(admin, starters.map((s) => s.player_id)),
    conceded(admin, match.home_team_id),
    conceded(admin, match.away_team_id),
  ]);
  const lines = await captureLines(admin, SPORTYBET_ADAPTER, match, squad, report).catch((e: unknown) => {
    report.errors.push(`lines ${match.id}: ${e instanceof Error ? e.message : String(e)}`);
    return new Map<string, PlayerLine[]>();
  });

  const listedPlayers = new Set([...lines.keys()].map((k) => k.slice(0, k.indexOf("|"))));
  report.starters += starters.length;
  report.startersWithLines += starters.filter((s) => listedPlayers.has(s.player_id)).length;

  const now = Date.now();
  const kickoff = Date.parse(match.kickoff);
  const logPicks = confirmed && kickoff > now && kickoff - now <= LOG_WINDOW_MS;
  const projections: Record<string, unknown>[] = [];
  const picks: Record<string, unknown>[] = [];

  for (const s of starters) {
    const pos = (s.usual_position ?? s.players?.usual_position ?? null) as PositionCode | null;
    if (pos === null || ![0, 1, 2, 3].includes(pos)) continue;
    const h = hist.get(s.player_id) ?? [];
    if (h.filter((g) => g.started).length < 5) continue; // as backtested: 5+ earlier starts
    const teamId = s.side === "home" ? match.home_team_id : match.away_team_id;
    const opp = (s.side === "home" ? awayConc : homeConc).get(pos) ?? [];
    const recentStarts = h.filter((g) => g.started).sort((a, b) => b.t - a.t).slice(0, 10);
    for (const market of PROP_MARKETS) {
      const fit = PROP_FIT[market];
      const p = project({ market, position: pos, history: h, conceded: opp, now: kickoff, priors: pri, params: fit.params });
      if (!p) continue;
      const listed = lines.get(`${s.player_id}|${market}`) ?? [];
      const rungs = buildLadder(p.mean, p.size, market, fit.calibration, listed);
      projections.push({
        match_id: match.id, player_id: s.player_id, market, team_id: teamId, position: pos,
        lineup: confirmed ? "confirmed" : "predicted", mean: Number(p.mean.toFixed(3)),
        size: Number.isFinite(p.size) ? Number(p.size.toFixed(3)) : null, minutes: null,
        ladder: { rungs, recent: recentStarts.map((g) => propValue(g, market)) },
        model_version: PROPS_MODEL_VERSION, computed_at: new Date().toISOString(),
      });
      if (!logPicks || !fit.publish || listed.length === 0) continue;
      const pick = choosePick((line) => calibrate(overProb(p.mean, p.size, line), fit.calibration), listed, SPORTYBET_ADAPTER.selection);
      if (!pick) continue;
      picks.push({
        match_id: match.id, player_id: s.player_id, team_id: teamId, market, line: pick.line, side: pick.side,
        probability: Number(pick.probability.toFixed(4)),
        market_probability: pick.marketProbability === null ? null : Number(pick.marketProbability.toFixed(4)),
        price: pick.price, platform: SPORTYBET_ADAPTER.platform, selection: pick.selection, risk: pick.risk,
        lineup: "confirmed", published: publish, kickoff: match.kickoff, model_version: PROPS_MODEL_VERSION,
        logged_at: new Date().toISOString(),
      });
    }
  }

  if (projections.length) {
    // A lineup change can drop a starter: start each game's projections afresh.
    await admin.from("player_prop_projections").delete().eq("match_id", match.id);
    for (let i = 0; i < projections.length; i += 500) {
      const { error } = await admin.from("player_prop_projections").insert(projections.slice(i, i + 500));
      if (error) report.errors.push(`projections: ${error.message}`);
    }
    report.projections += projections.length;
  }
  if (logPicks) {
    // Before kickoff the set is replaced as lines move; after kickoff it is frozen.
    await admin.from("player_prop_picks").delete().eq("match_id", match.id).is("result", null).gt("kickoff", new Date().toISOString());
    if (picks.length) {
      const { error } = await admin.from("player_prop_picks").upsert(picks, { onConflict: "match_id,player_id,market" });
      if (error) report.errors.push(`picks: ${error.message}`);
      else report.picks += picks.length;
    }
  }
}

/** Grade unsettled picks whose game has player stats. A player with no minutes is void. */
export async function settlePlayerProps(admin: Admin): Promise<number> {
  const { data: open, error } = await admin
    .from("player_prop_picks")
    .select("id, match_id, player_id, market, line, side, kickoff")
    .is("result", null)
    .lt("kickoff", new Date(Date.now() - 2 * 3_600_000).toISOString())
    .order("kickoff")
    .limit(1000);
  if (error || !open?.length) return 0;
  const matchIds = [...new Set(open.map((p) => p.match_id))];
  const [{ data: details }, { data: matches }] = await Promise.all([
    admin.from("match_details").select("match_id, finished, has_player_stats").in("match_id", matchIds),
    admin.from("matches").select("id, status, kickoff").in("id", matchIds),
  ]);
  const ready = new Set((details ?? []).filter((d) => d.finished && d.has_player_stats).map((d) => d.match_id));
  const dead = new Set((matches ?? []).filter((m) => m.status === "postponed" || m.status === "cancelled").map((m) => m.id));
  const ids = matchIds.filter((m) => ready.has(m));
  const stats = new Map<string, Record<string, number | null>>();
  for (let i = 0; i < ids.length; i += 50) {
    const data = await allPages<Record<string, number | null> & { match_id: string; player_id: string }>((from, to) =>
      admin
        .from("player_match_stats")
        .select("match_id, player_id, minutes, goals, assists, shots, shots_on_target, tackles, clearances, fouls_committed, passes_attempted, saves")
        .in("match_id", ids.slice(i, i + 50))
        .order("match_id")
        .order("player_id")
        .range(from, to),
    );
    for (const r of data) stats.set(`${r.match_id}|${r.player_id}`, r);
  }
  let settled = 0;
  const now = new Date().toISOString();
  for (const p of open) {
    let update: Record<string, unknown> | null = null;
    if (dead.has(p.match_id)) update = { result: "void", void_reason: "game not played", settled_at: now };
    else if (ready.has(p.match_id)) {
      const s = stats.get(`${p.match_id}|${p.player_id}`);
      if (!s || !s.minutes) update = { result: "void", void_reason: "did not play", settled_at: now };
      else {
        const actual = propValue({
          g: s.goals ?? 0, a: s.assists ?? 0, sh: s.shots ?? 0, sot: s.shots_on_target ?? 0, tk: s.tackles ?? 0,
          cl: s.clearances ?? 0, fc: s.fouls_committed ?? 0, pa: s.passes_attempted ?? 0, sv: s.saves ?? 0,
        }, p.market as PropMarketKey);
        const line = Number(p.line);
        const result = actual === line ? "push" : (actual > line) === (p.side === "over") ? "win" : "lose";
        update = { result, actual, settled_at: now };
      }
    } else if (Date.parse(p.kickoff) < Date.now() - 7 * DAY) {
      update = { result: "void", void_reason: "no player stats", settled_at: now };
    }
    if (!update) continue;
    const { error: e } = await admin.from("player_prop_picks").update(update).eq("id", p.id).is("result", null);
    if (!e) settled++;
  }
  return settled;
}

/** One pipeline run (the cron route). */
export async function runPlayerProps(admin: Admin): Promise<PropsRunReport> {
  const report: PropsRunReport = { settled: 0, matches: 0, projections: 0, lines: 0, unmatched: 0, starters: 0, startersWithLines: 0, skippedMarkets: 0, picks: 0, errors: [] };
  report.settled = await settlePlayerProps(admin).catch((e: unknown) => {
    report.errors.push(`settle: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  });

  const now = Date.now();
  const { data: games, error } = await admin
    .from("matches")
    .select("id, source_ids, kickoff, league_code, home_team_id, away_team_id, home_name, away_name")
    .gt("kickoff", new Date(now).toISOString())
    .lte("kickoff", new Date(now + HORIZON_MS).toISOString())
    .in("league_code", FOTMOB_CODES)
    .order("kickoff")
    .limit(80);
  if (error) {
    report.errors.push(`matches: ${error.message}`);
    return report;
  }
  if (!games?.length) return report;
  const ids = games.map((g) => g.id);
  const [{ data: details }, lineupRows, done] = await Promise.all([
    admin.from("match_details").select("match_id, lineup_type").in("match_id", ids),
    allPages((from, to) =>
      admin.from("match_lineup_players").select("match_id, player_id, side, role, usual_position, players(name, usual_position)")
        .in("match_id", ids).order("match_id").order("player_id").range(from, to),
    ),
    allPages<{ match_id: string; lineup: string; computed_at: string }>((from, to) =>
      admin.from("player_prop_projections").select("match_id, lineup, computed_at")
        .in("match_id", ids).order("match_id").order("player_id").order("market").range(from, to),
    ),
  ]);
  const lineupType = new Map((details ?? []).map((d) => [d.match_id, d.lineup_type as string | null]));
  const byMatch = new Map<string, LineupRow[]>();
  for (const r of (lineupRows ?? []) as unknown as LineupRow[]) {
    const list = byMatch.get(r.match_id);
    if (list) list.push(r); else byMatch.set(r.match_id, [r]);
  }
  const last = new Map<string, { at: number; lineup: string }>();
  for (const d of done ?? []) {
    const at = Date.parse(d.computed_at);
    const cur = last.get(d.match_id);
    if (!cur || at > cur.at) last.set(d.match_id, { at, lineup: d.lineup });
  }

  const publish = await switchOn("player_props").catch(() => false);
  let ran = 0;
  for (const g of games as MatchRow[]) {
    if (ran >= MAX_MATCHES) break;
    const lineup = byMatch.get(g.id) ?? [];
    if (lineup.filter((r) => r.role === "starter").length < 20) continue;
    const confirmed = lineupType.get(g.id) === "standard";
    const prev = last.get(g.id);
    const kickoff = Date.parse(g.kickoff);
    const inLogWindow = confirmed && kickoff - now <= LOG_WINDOW_MS;
    // Skip a fresh projection unless the eleven was just confirmed or picks are due.
    if (prev && now - prev.at < REFRESH_MS && !(confirmed && prev.lineup !== "confirmed") && !inLogWindow) continue;
    try {
      await runMatch(admin, g, lineup, confirmed, publish, report);
      report.matches++;
    } catch (e) {
      report.errors.push(`${g.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    ran++;
  }
  return report;
}
