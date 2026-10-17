import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMatch } from "@/lib/providers";
import { evaluatePick, evaluateStatPick, statKindOf, type PickResult } from "@/lib/settlement";
import { leagueByCode } from "@/lib/leagues";
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
  if (!pending || pending.length === 0) return 0;

  let settledCount = 0;
  const statCache = new Map<string, StatGame[]>();
  for (const row of pending) {
    const matchId = row.match_id as string;

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
      ? await gradeFromStats(admin, row as StatRow, statCache)
      : evaluatePick(market, homeGoals, awayGoals);
    if (!result) continue;

    const { error: updateError } = await admin
      .from("predictions_log")
      .update({
        result,
        actual_home_goals: homeGoals,
        actual_away_goals: awayGoals,
        settled_at: new Date().toISOString(),
      })
      .eq("id", row.id as string);
    if (!updateError) settledCount++;
  }
  return settledCount;
}

/* ------------------------------------------------- corners and shots picks */

interface StatRow {
  market: string;
  league_code: string | null;
  home_name: string;
  away_name: string;
  kickoff: string;
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
 * results archive (historical_results). Those arrive with football-data.co.uk
 * a few days after the game, so until then the pick stays open (null).
 */
async function gradeFromStats(admin: SupabaseClient, row: StatRow, cache: Map<string, StatGame[]>): Promise<PickResult | null> {
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
  return Date.now() - at > STAT_WAIT_MS ? "push" : null;
}
