import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMatch } from "@/lib/providers";
import { evaluatePick, evaluateStatPick, statKindOf, type PickResult } from "@/lib/settlement";
import { espnDay, espnStatsComplete, findEspnGame, type EspnResult } from "@/lib/archive/espn-shots";
import { leagueByCode } from "@/lib/leagues";
import { priceInSnapshot } from "@/lib/odds/market-prob";
import { lastSnapshotBefore } from "@/lib/odds/sportybet-links";
import { looseKey, nameBook, nameScope } from "@/lib/teams/canonical";
import type { Match } from "@/lib/types";

/**
 * Service-role I/O for settlement + the match-results archive — kept out of
 * settlement.ts (which stays pure grading logic with its own unit tests;
 * `import "server-only"` here would crash settlement.test.ts under vitest's
 * plain-Node environment, since that package's default export condition
 * unconditionally throws outside a react-server bundling context).
 *
 * Both functions below take an already-constructed service-role client
 * rather than constructing one — callers (the daily cron, the opportunistic
 * pass from /api/live) are the ones that know which trust boundary they're
 * operating in; see the third carve-out in src/lib/supabase/admin.ts's doc
 * comment for why a public, unauthenticated route is still safe to do this
 * from.
 */

/** Bulk-upserts whatever matches were already fetched for another reason (a
 * live feed poll, an upcoming-fixtures read) into the match_results archive.
 * No extra provider calls — this only ever writes data already in hand. */
export async function captureMatchResults(
  admin: SupabaseClient,
  matches: Match[],
): Promise<void> {
  if (matches.length === 0) return;
  const rows = matches.map((m) => ({
    match_id: m.id,
    league: m.league.name,
    // See the note at the predictions_log write site: the display name is the
    // provider's, the code is ours, and only one of them is a key.
    league_code: m.league.code ?? null,
    home_name: m.home.name,
    away_name: m.away.name,
    kickoff: m.kickoff,
    home_goals: m.score.home,
    away_goals: m.score.away,
    status: m.status,
    captured_at: new Date().toISOString(),
  }));
  await admin.from("match_results").upsert(rows, { onConflict: "match_id" });
}

/**
 * Settles every predictions_log row whose kickoff has passed and hasn't
 * been graded yet. Prefers a cached score from match_results over a live
 * provider re-fetch — the actual robustness fix over the old
 * settlePastPicks: an old match's score no longer depends on a rate-limited
 * free-tier API still having it days later.
 *
 * `maxAgeHours`, when given, bounds the sweep to recently-kicked-off
 * matches — the cheap shape for the opportunistic pass triggered by every
 * /api/live poll. Omitted entirely for the daily cron's full-backlog
 * safety-net sweep (matches nobody had a live view open for).
 */
export async function runSettlementPass(
  admin: SupabaseClient,
  opts: { maxAgeHours?: number } = {},
): Promise<number> {
  let query = admin
    .from("predictions_log")
    .select("id, match_id, market, league_code, home_name, away_name, kickoff")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: false });

  if (opts.maxAgeHours) {
    query = query.gt("kickoff", new Date(Date.now() - opts.maxAgeHours * 60 * 60 * 1000).toISOString());
  }

  // Corners and shots picks wait days for their stats, so the sweep reads past them.
  const { data: pending, error } = await query.limit(600);
  if (error) throw error;
  if (!pending || pending.length === 0) {
    await settleShadowPicks(admin).catch(() => 0);
    return 0;
  }

  let settledCount = 0;
  const statCache = new Map<string, StatGame[]>();
  // The pass behind a live poll gets a short ESPN budget; the daily sweep a long one.
  const espnCache: EspnCache = { games: new Map(), until: Date.now() + (opts.maxAgeHours ? ESPN_QUICK_BUDGET_MS : ESPN_BUDGET_MS) };
  for (const row of pending) {
    const matchId = row.match_id as string;
    // A corners or shots pick waits until the game is surely over (ESPN has
    // the counts minutes after); before that there is nothing to grade on.
    if (statKindOf(row.market as string) && Date.now() - Date.parse(row.kickoff as string) < STAT_READY_MS) continue;

    const { data: cached } = await admin
      .from("match_results")
      .select("status, home_goals, away_goals")
      .eq("match_id", matchId)
      .maybeSingle();

    let status = cached?.status;
    let homeGoals = cached?.home_goals ?? null;
    let awayGoals = cached?.away_goals ?? null;

    // No cached result, or it hadn't finished yet as of when it was
    // captured — fall back to a live re-fetch, same as before.
    if (!cached || status !== "finished") {
      const match = await getMatch(matchId).catch(() => null);
      if (!match) continue;
      status = match.status;
      homeGoals = match.score.home;
      awayGoals = match.score.away;
      // Cache it now that we've paid for the fetch, so a future retry
      // (this row or another) doesn't need to hit the provider again.
      await captureMatchResults(admin, [match]);
    }

    if (status !== "finished" || homeGoals === null || awayGoals === null) continue;

    const market = row.market as string;
    const result = statKindOf(market)
      ? await gradeFromStats(
          admin,
          { market, league_code: row.league_code, home_name: row.home_name, away_name: row.away_name, kickoff: row.kickoff, hg: homeGoals, ag: awayGoals },
          statCache,
          espnCache,
        )
      : evaluatePick(market, homeGoals, awayGoals);
    if (!result) continue;

    const closing = await closingFor(matchId, row.kickoff as string, market);
    const { error: updateError } = await admin
      .from("predictions_log")
      .update({
        result,
        actual_home_goals: homeGoals,
        actual_away_goals: awayGoals,
        settled_at: new Date().toISOString(),
        ...closing,
      })
      .eq("id", row.id as string);
    if (!updateError) settledCount++;
  }
  await settleShadowPicks(admin).catch(() => 0);
  return settledCount;
}

/**
 * SportyBet's closing price for a pick: the last snapshot before kick-off
 * (market-prob.ts). Empty when there is none, so the update leaves the
 * columns null rather than failing.
 */
async function closingFor(matchId: string, kickoff: string, market: string) {
  const snap = await lastSnapshotBefore(matchId, Date.parse(kickoff)).catch(() => null);
  const price = snap ? priceInSnapshot(snap.prices, market) : null;
  return price ? { closing_price: price.odds, closing_market_prob: price.fairProbability } : {};
}

/**
 * Grades the shadow picks (model/shadow.ts) from the results archive only.
 * Every one shares its game with a predictions_log row, whose settlement
 * above has already cached the final score, so this costs no provider call.
 */
export async function settleShadowPicks(admin: SupabaseClient): Promise<number> {
  const { data: rows } = await admin
    .from("shadow_picks")
    .select("match_id, market, kickoff")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .limit(500);
  if (!rows || rows.length === 0) return 0;

  const ids = [...new Set(rows.map((r) => r.match_id as string))];
  const { data: results } = await admin
    .from("match_results")
    .select("match_id, home_goals, away_goals")
    .in("match_id", ids)
    .eq("status", "finished");
  const scores = new Map((results ?? []).map((r) => [r.match_id as string, r]));

  let n = 0;
  for (const row of rows) {
    const s = scores.get(row.match_id as string);
    if (typeof s?.home_goals !== "number" || typeof s?.away_goals !== "number") continue;
    const result = evaluatePick(row.market as string, s.home_goals, s.away_goals);
    if (!result) continue;
    const closing = await closingFor(row.match_id as string, row.kickoff as string, row.market as string);
    const { error } = await admin
      .from("shadow_picks")
      .update({ result, actual_home_goals: s.home_goals, actual_away_goals: s.away_goals, settled_at: new Date().toISOString(), ...closing })
      .eq("match_id", row.match_id as string)
      .eq("market", row.market as string);
    if (!error) n++;
  }
  return n;
}

/* ------------------------------------------------- corners and shots picks */

interface StatRow {
  market: string;
  league_code: string | null;
  home_name: string;
  away_name: string;
  kickoff: string;
  hg: number;
  ag: number;
}

interface StatGame {
  at: number;
  home: string;
  away: string;
  corners: [number, number] | null;
  shots: [number, number] | null;
  shotsOnTarget: [number, number] | null;
}

/** After this long without stats a pick is voided rather than left open for ever. */
const STAT_WAIT_MS = 10 * 86_400_000;

/**
 * A corners, shots or shots-on-target pick, graded from the counts in the
 * results archive (historical_results) when it already has them, otherwise
 * from ESPN's scoreboard, which has them minutes after full time. ESPN's
 * counts are taken as final (decided 18 Oct 2026): a pick graded from them
 * is not re-graded when the archive arrives.
 */
async function gradeFromStats(
  admin: SupabaseClient,
  row: StatRow,
  cache: Map<string, StatGame[]>,
  espnCache: EspnCache,
): Promise<PickResult | null> {
  const kind = statKindOf(row.market);
  const code = row.league_code;
  if (!kind || !code) return null;
  const at = Date.parse(row.kickoff);
  const day = new Date(at).toISOString().slice(0, 10);
  const key = `${code}|${day}`;
  if (!cache.has(key)) {
    const { data } = await admin
      .from("historical_results")
      .select("kickoff, home_name, away_name, home_corners, away_corners, home_shots, away_shots, home_shots_on_target, away_shots_on_target")
      .eq("league_code", code)
      .gte("kickoff", new Date(at - 36 * 3_600_000).toISOString())
      .lte("kickoff", new Date(at + 36 * 3_600_000).toISOString());
    const pair = (a: unknown, b: unknown): [number, number] | null => (typeof a === "number" && typeof b === "number" ? [a, b] : null);
    cache.set(
      key,
      (data ?? []).map((r) => ({
        at: Date.parse(r.kickoff as string),
        home: r.home_name as string,
        away: r.away_name as string,
        corners: pair(r.home_corners, r.away_corners),
        shots: pair(r.home_shots, r.away_shots),
        shotsOnTarget: pair(r.home_shots_on_target, r.away_shots_on_target),
      })),
    );
  }
  const def = leagueByCode(code);
  const scope = def ? nameScope(def) : null;
  const book = scope ? await nameBook(scope) : null;
  const canon = (n: string) => looseKey(book?.canonical.get(looseKey(n)) ?? n);
  const game = cache.get(key)!.find((g) => canon(g.home) === canon(row.home_name) && canon(g.away) === canon(row.away_name));
  const counts = game?.[kind];
  if (counts) return evaluateStatPick(row.market, counts[0], counts[1]);
  const espn = await espnCounts(row, kind, espnCache);
  if (espn) {
    const grade = evaluateStatPick(row.market, espn[0], espn[1]);
    if (grade) return grade;
  }
  return Date.now() - at > STAT_WAIT_MS ? "push" : null;
}

/** ESPN days fetched in this pass, and the time after which the pass stops asking (the cron has 120s in all). */
interface EspnCache {
  games: Map<string, Promise<EspnResult[]>>;
  until: number;
}
const ESPN_BUDGET_MS = 40_000;
const ESPN_QUICK_BUDGET_MS = 8_000;
/** Kick-off plus a full game and stoppage: from here a stat pick can be graded. */
const STAT_READY_MS = 115 * 60_000;

/** The game's counts from ESPN's scoreboard (the kick-off day and the day before, as ESPN dates by US time), if complete. */
async function espnCounts(row: StatRow, kind: "corners" | "shots" | "shotsOnTarget", cache: EspnCache): Promise<[number, number] | null> {
  const slug = row.league_code ? leagueByCode(row.league_code)?.ids.espn : undefined;
  if (!slug || Date.now() > cache.until) return null;
  const at = Date.parse(row.kickoff);
  const days = [new Date(at), new Date(at - 86_400_000)];
  const games: EspnResult[] = [];
  for (const d of days) {
    const key = `${slug}|${d.toISOString().slice(0, 10)}`;
    if (!cache.games.has(key)) cache.games.set(key, espnDay(slug, d).catch(() => []));
    games.push(...(await cache.games.get(key)!));
  }
  const g = findEspnGame(games, { home: row.home_name, away: row.away_name, kickoff: at, hg: row.hg, ag: row.ag });
  if (!g || !espnStatsComplete(g)) return null;
  if (kind === "corners") return [g.hc!, g.ac!];
  if (kind === "shots") return [g.hs!, g.as!];
  return [g.hsot!, g.asot!];
}
