import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMatch } from "@/lib/providers";
import { evaluatePick, evaluateStatPick, statKindOf, type PickResult } from "@/lib/settlement";
import { gradeLegFull } from "@/lib/leg-pricing";
import { isRawMarket } from "@/lib/odds/markets";
import { espnDay, espnStatsComplete, findEspnGame, type EspnResult } from "@/lib/archive/espn-shots";
import { leagueByCode } from "@/lib/leagues";
import { priceInSnapshot } from "@/lib/odds/market-prob";
import { lastSnapshotBefore } from "@/lib/odds/sportybet-links";
import { looseKey, nameBook, nameScope } from "@/lib/teams/canonical";
import type { Match } from "@/lib/types";
import { settleStep, type SettleOpts } from "@/lib/settlement-timing";
import { gradePick, halftimeOf } from "@/lib/pick-grade";

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
/**
 * What each match was last written as, per server instance. The live board
 * and the tracked-slip poll call captureMatchResults every twenty to thirty
 * seconds with mostly the same games, and an upsert of an unchanged row still
 * writes a new row version (about 22,000 a day). Only a game whose status or
 * score differs from what this instance last wrote goes out. Module state is
 * only a cache: losing it means one extra write.
 */
const captured = new Map<string, string>();
const CAPTURED_MAX = 3_000;
const stamp = (m: Match) => `${m.status}|${m.score.home}|${m.score.away}`;

export async function captureMatchResults(
  admin: SupabaseClient,
  all: Match[],
): Promise<void> {
  const matches = all.filter((m) => captured.get(m.id) !== stamp(m));
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
  const { error } = await admin.from("match_results").upsert(rows, { onConflict: "match_id" });
  if (error) return;
  // The half-time score, kept for the markets settled on the halves. Written
  // apart from the rows above so a later capture that lacks it (a feed with no
  // half-time score) can never wipe the one stored while the game was at the
  // break: the score at the break IS the half-time score.
  for (const m of matches) {
    const ht = halftimeOf(m.halftime) ?? (m.status === "halftime" ? halftimeOf(m.score) : null);
    if (ht) await admin.from("match_results").update({ ht_home: ht.home, ht_away: ht.away }).eq("match_id", m.id);
  }
  for (const m of matches) {
    // Re-inserting moves it to the newest end, so the oldest are the ones dropped.
    captured.delete(m.id);
    captured.set(m.id, stamp(m));
  }
  while (captured.size > CAPTURED_MAX) captured.delete(captured.keys().next().value as string);
}

/** For tests. */
export function resetCapturedMatches() {
  captured.clear();
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
  opts: SettleOpts = {},
): Promise<number> {
  // Every unsettled pick whose game has started. A game moved to another day
  // keeps the kickoff it was logged with, so the age of a row is not used to
  // leave it out here: settleStep decides what each row may cost.
  const { data: pending, error } = await admin
    .from("predictions_log")
    .select("id, match_id, market, league_code, home_name, away_name, kickoff")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: false })
    .limit(600);
  if (error) throw error;
  if (!pending || pending.length === 0) {
    await settleShadowPicks(admin).catch(() => 0);
    await settleEnginePicks(admin, opts).catch(() => 0);
    await settlePosts();
    return 0;
  }

  // The scores already stored, in one read.
  const { data: stored } = await admin
    .from("match_results")
    .select("match_id, status, home_goals, away_goals, ht_home, ht_away")
    .in("match_id", [...new Set(pending.map((r) => r.match_id as string))]);
  const results = new Map((stored ?? []).map((r) => [r.match_id as string, r]));
  const archive = new Map<string, ArchiveHalf[]>();

  let settledCount = 0;
  let refetchesLeft = opts.maxRefetch ?? Number.POSITIVE_INFINITY;
  const statCache = new Map<string, StatGame[]>();
  // The pass behind a live poll gets a short ESPN budget; the daily sweep a long one.
  const espnCache: EspnCache = { games: new Map(), until: Date.now() + (opts.maxAgeHours ? ESPN_QUICK_BUDGET_MS : ESPN_BUDGET_MS) };
  for (const row of pending) {
    const matchId = row.match_id as string;
    // A corners or shots pick waits until the game is surely over (ESPN has
    // the counts minutes after); before that there is nothing to grade on.
    if (statKindOf(row.market as string) && Date.now() - Date.parse(row.kickoff as string) < STAT_READY_MS) continue;

    const cached = results.get(matchId);
    const cachedFinished = cached?.status === "finished" && typeof cached.home_goals === "number" && typeof cached.away_goals === "number";
    const step = settleStep({ cachedFinished, ageMs: Date.now() - Date.parse(row.kickoff as string), refetchesLeft }, opts);
    if (step === "skip") continue;

    let status = cached?.status;
    let homeGoals = cached?.home_goals ?? null;
    let awayGoals = cached?.away_goals ?? null;

    // No stored score yet: look the game up, and store what comes back so a
    // retry (this row or another) doesn't ask the provider again.
    if (step === "refetch") {
      refetchesLeft--;
      const match = await getMatch(matchId).catch(() => null);
      if (!match) continue;
      status = match.status;
      homeGoals = match.score.home;
      awayGoals = match.score.away;
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
      : await gradeAny(admin, { market, league_code: row.league_code, home_name: row.home_name, away_name: row.away_name, kickoff: row.kickoff, hg: homeGoals, ag: awayGoals }, halftimeOf({ home: cached?.ht_home ?? null, away: cached?.ht_away ?? null }), archive);
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
  await settleEnginePicks(admin, opts).catch(() => 0);
  await settlePosts();
  return settledCount;
}

/** Community codes on the Code Hub, graded from the same results (code-hub-posts.ts). */
async function settlePosts(): Promise<void> {
  const { settleCommunityPosts } = await import("@/lib/code-hub-posts");
  await settleCommunityPosts().catch(() => 0);
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
    .select("match_id, market, kickoff, league_code, home_name, away_name")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .limit(500);
  if (!rows || rows.length === 0) return 0;

  const ids = [...new Set(rows.map((r) => r.match_id as string))];
  const { data: results } = await admin
    .from("match_results")
    .select("match_id, home_goals, away_goals, ht_home, ht_away")
    .in("match_id", ids)
    .eq("status", "finished");
  const scores = new Map((results ?? []).map((r) => [r.match_id as string, r]));
  // Half-time scores, for the new markets settled on the halves (0079).
  const halves = new Map<string, { home: number; away: number }>();
  const rawIds = [...new Set(rows.filter((r) => isRawMarket(r.market as string)).map((r) => r.match_id as string))].filter((id) =>
    /^[0-9a-f-]{36}$/i.test(id),
  );
  if (rawIds.length > 0) {
    const { data: ht } = await admin.from("matches").select("id, ht_home, ht_away").in("id", rawIds);
    for (const m of ht ?? []) {
      if (typeof m.ht_home === "number" && typeof m.ht_away === "number") halves.set(m.id as string, { home: m.ht_home, away: m.ht_away });
    }
  }

  let n = 0;
  const archive = new Map<string, ArchiveHalf[]>();
  for (const row of rows) {
    const s = scores.get(row.match_id as string);
    if (typeof s?.home_goals !== "number" || typeof s?.away_goals !== "number") continue;
    const market = row.market as string;
    // Provider ids (sdb:, fd:) have no row in matches; the archive's goal
    // timelines (ESPN, nightly) carry their half-time score.
    const ht = isRawMarket(market)
      ? (halftimeOf({ home: s.ht_home ?? null, away: s.ht_away ?? null }) ??
        halves.get(row.match_id as string) ??
        (await archiveHalfTime(admin, { league_code: row.league_code, home_name: row.home_name, away_name: row.away_name, kickoff: row.kickoff, hg: s.home_goals, ag: s.away_goals }, archive)))
      : null;
    const graded = isRawMarket(market)
      ? gradeLegFull(market, { home: s.home_goals, away: s.away_goals }, ht)
      : evaluatePick(market, s.home_goals, s.away_goals);
    const result = graded === "win" || graded === "lose" || graded === "push" ? graded : null;
    if (!result) {
      // A halves market whose half-time score never came: closed ungraded after
      // five days (the timelines land nightly), so it doesn't hold a place in
      // this queue for ever.
      if (isRawMarket(market) && Date.parse(row.kickoff as string) < Date.now() - 5 * 86_400_000) {
        await admin
          .from("shadow_picks")
          .update({ actual_home_goals: s.home_goals, actual_away_goals: s.away_goals, settled_at: new Date().toISOString() })
          .eq("match_id", row.match_id as string)
          .eq("market", market);
      }
      continue;
    }
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

/**
 * Grades the headline engine's log (engine_picks, 0082): goals picks from the
 * final score in match_results, corners and shots picks the way the
 * published ones are (gradeFromStats). Its games are the logged ones, so the
 * score is normally cached already; a game without one waits for the pass
 * that settles its predictions_log row. Corners and shots are graded only by
 * the daily sweep, so a live poll never waits on ESPN for them.
 */
export async function settleEnginePicks(admin: SupabaseClient, opts: SettleOpts = {}): Promise<number> {
  const { data: rows } = await admin
    .from("engine_picks")
    .select("match_id, slot, market, league_code, home_name, away_name, kickoff")
    .is("settled_at", null)
    .lt("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: true })
    .limit(800);
  if (!rows || rows.length === 0) return 0;

  const ids = [...new Set(rows.map((r) => r.match_id as string))];
  const { data: results } = await admin
    .from("match_results")
    .select("match_id, home_goals, away_goals, ht_home, ht_away")
    .in("match_id", ids)
    .eq("status", "finished");
  const scores = new Map((results ?? []).map((r) => [r.match_id as string, r]));
  const archive = new Map<string, ArchiveHalf[]>();

  const statCache = new Map<string, StatGame[]>();
  // Inside the cron's 120 s, after the published picks have had theirs.
  const espnCache: EspnCache = { games: new Map(), until: Date.now() + 2 * ESPN_QUICK_BUDGET_MS };
  let n = 0;
  for (const row of rows) {
    const s = scores.get(row.match_id as string);
    if (typeof s?.home_goals !== "number" || typeof s?.away_goals !== "number") continue;
    const market = row.market as string;
    const stat = statKindOf(market);
    // Corners and shots wait for the daily sweep: the pass behind a live poll stays quick.
    if (stat && ((opts.maxAgeHours && !opts.withStats) || Date.now() - Date.parse(row.kickoff as string) < STAT_READY_MS)) continue;
    const result = stat
      ? await gradeFromStats(
          admin,
          { market, league_code: row.league_code, home_name: row.home_name, away_name: row.away_name, kickoff: row.kickoff, hg: s.home_goals, ag: s.away_goals },
          statCache,
          espnCache,
        )
      : await gradeAny(admin, { market, league_code: row.league_code, home_name: row.home_name, away_name: row.away_name, kickoff: row.kickoff, hg: s.home_goals, ag: s.away_goals }, halftimeOf({ home: s.ht_home ?? null, away: s.ht_away ?? null }), archive);
    if (!result) continue;
    const { error } = await admin
      .from("engine_picks")
      .update({ result, actual_home_goals: s.home_goals, actual_away_goals: s.away_goals, settled_at: new Date().toISOString() })
      .eq("match_id", row.match_id as string)
      .eq("slot", row.slot as string);
    if (!error) n++;
  }
  return n;
}

/**
 * Any logged pick's grade: our own markets and the stat markets as before, the
 * halves markets from the half-time score stored at the break (match_results),
 * else from the nightly archive. Null while a halves market has no half-time
 * score yet; the next pass tries again.
 */
async function gradeAny(
  admin: SupabaseClient,
  row: StatRow,
  stored: { home: number; away: number } | null,
  archive: Map<string, ArchiveHalf[]>,
): Promise<PickResult | null> {
  if (!isRawMarket(row.market)) return gradePick(row.market, row.hg, row.ag);
  const ht = stored ?? (await archiveHalfTime(admin, row, archive));
  return gradePick(row.market, row.hg, row.ag, ht);
}

interface ArchiveHalf {
  home: string;
  away: string;
  hg: number;
  ag: number;
  ht: { home: number; away: number };
}

/**
 * A finished game's half-time score from the results archive's goal
 * timelines (goal_timelines, filled nightly from ESPN), matched like the
 * corners and shots grading: same competition, within a day and a half of
 * kick-off, same two clubs by the competition's name book, same final score.
 */
async function archiveHalfTime(
  admin: SupabaseClient,
  row: Pick<StatRow, "league_code" | "home_name" | "away_name" | "kickoff" | "hg" | "ag">,
  cache: Map<string, ArchiveHalf[]>,
): Promise<{ home: number; away: number } | null> {
  const code = row.league_code;
  if (!code) return null;
  const at = Date.parse(row.kickoff);
  const key = `${code}|${new Date(at).toISOString().slice(0, 10)}`;
  if (!cache.has(key)) {
    const { data } = await admin
      .from("historical_results")
      .select("home_name, away_name, home_goals, away_goals, goal_timelines!inner(ht_home, ht_away)")
      .eq("league_code", code)
      .gte("kickoff", new Date(at - 36 * 3_600_000).toISOString())
      .lte("kickoff", new Date(at + 36 * 3_600_000).toISOString());
    cache.set(
      key,
      (data ?? []).flatMap((r) => {
        const t = (Array.isArray(r.goal_timelines) ? r.goal_timelines[0] : r.goal_timelines) as { ht_home: number | null; ht_away: number | null } | undefined;
        return t && typeof t.ht_home === "number" && typeof t.ht_away === "number"
          ? [{ home: r.home_name as string, away: r.away_name as string, hg: r.home_goals as number, ag: r.away_goals as number, ht: { home: t.ht_home, away: t.ht_away } }]
          : [];
      }),
    );
  }
  const def = leagueByCode(code);
  const scope = def ? nameScope(def) : null;
  const book = scope ? await nameBook(scope) : null;
  const canon = (n: string) => looseKey(book?.canonical.get(looseKey(n)) ?? n);
  const game = cache.get(key)!.find((g) => canon(g.home) === canon(row.home_name) && canon(g.away) === canon(row.away_name) && g.hg === row.hg && g.ag === row.ag);
  return game?.ht ?? null;
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
