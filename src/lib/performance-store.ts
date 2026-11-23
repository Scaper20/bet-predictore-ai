import "server-only";

import { supabasePublic } from "@/lib/supabase/public";
import { cached } from "@/lib/providers/cache";
import { allPages } from "@/lib/supabase/pages";
import { leagueByProviderName } from "@/lib/leagues";
import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import { summarise, tally, type SettledBreakdown, type SettledRecord, type SettledRow } from "@/lib/performance";
import { isEngineGroup, type EngineGroup } from "@/lib/model/headline-engine";
import { previousMatchday, type LoggedPick, type MatchdayRecord } from "@/lib/matchday";

/**
 * Reads settled picks for the public performance surfaces.
 *
 * predictions_log carries a public SELECT policy (0001_init.sql) precisely so
 * the track record can be a logged-out trust surface, so this uses the anon
 * client rather than the service-role one behind admin-analytics.ts.
 *
 * Split from performance.ts for the reason documented there: `server-only`
 * throws under vitest, and the tallying logic needs tests.
 */

interface RawRow {
  league: string | null;
  league_code?: string | null;
  market: string;
  model_id: string | null;
  result: "win" | "lose" | "push";
  pick_tier?: string | null;
}

/**
 * Resolves the slug every aggregate groups on.
 *
 * Two sources, in order of trust: the column written at prediction time from
 * `match.league.code`, then the alias table, which recovers a slug from the
 * provider display string for rows written before 0013. That second path is
 * why the fix works on historical data without waiting for a backfill, and why
 * a row whose competition is genuinely outside the catalogue still resolves to
 * null rather than to a wrong league.
 */
function toSettledRow(row: RawRow): SettledRow {
  return {
    league_code: row.league_code ?? leagueByProviderName(row.league)?.code ?? null,
    market: row.market,
    model_id: row.model_id,
    result: row.result,
    pick_tier: row.pick_tier ?? null,
  };
}

/**
 * Settled picks for a sport, optionally windowed.
 *
 * `byLeague` is keyed on the catalogue CODE. It used to be keyed on the stored
 * display name, which is whatever the answering provider called the
 * competition — see 0013_league_code.sql for why not one of those strings ever
 * matched what callers looked up.
 */
export async function settledRecords(
  opts: { sport?: SportId; sinceDays?: number } = {},
): Promise<SettledBreakdown> {
  const sport = opts.sport ?? DEFAULT_SPORT;
  const sinceDays = opts.sinceDays;

  // Settlement runs on a cron, so this moves on the order of hours. Ten
  // minutes keeps the track record and the For You league strip on one shared
  // read instead of one per request.
  return cached(`settled:${sport}:${sinceDays ?? "all"}`, 10 * 60_000, async () => {
    const supabase = supabasePublic();
    if (!supabase) return summarise([]);

    const cutoff =
      sinceDays === undefined
        ? undefined
        : new Date(Date.now() - sinceDays * 86_400_000).toISOString();

    // Page by page: the Data API stops at 1,000 rows a request without
    // saying so. A single read capped this record at 999 picks from
    // mid-November 2026 (the oldest, unordered), so the track record showed
    // 70.4% while the full log stood at 73.1% over 2,024. The id tie-break
    // keeps pages from repeating or skipping rows.
    const run = async (columns: string): Promise<{ data: unknown[] | null; error: { message: string } | null }> => {
      try {
        const data = await allPages<unknown>((from, to) => {
          let query = supabase
            .from("predictions_log")
            .select(columns)
            .eq("sport", sport)
            .not("settled_at", "is", null)
            .not("result", "is", null);
          if (cutoff) query = query.gte("kickoff", cutoff);
          return query.order("kickoff", { ascending: true }).order("id", { ascending: true }).range(from, to);
        });
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    };

    // pick_tier arrives in 0040; until it is applied, read without it and
    // the Strong record simply starts empty.
    const withTier = await run("league, league_code, market, model_id, result, pick_tier");
    if (!withTier.error && withTier.data) {
      return summarise((withTier.data as unknown as RawRow[]).map(toSettledRow));
    }

    const withCode = await run("league, league_code, market, model_id, result");
    if (!withCode.error && withCode.data) {
      return summarise((withCode.data as unknown as RawRow[]).map(toSettledRow));
    }

    // league_code arrives in 0013 and model_id in 0012. Selecting a column
    // that does not exist yet is a 400 from PostgREST, and swallowing that
    // used to make every figure on the track record read zero while the
    // settled log right beside it listed fifty rows. Falling back keeps the
    // numbers right whichever order code and migrations land in — and
    // toSettledRow still recovers the slug from the display name, so the
    // per-league grouping works even before 0013 is applied.
    const legacy = await run("league, market, result");
    if (legacy.error || !legacy.data) {
      // Performance figures are a trust surface, never an authorization
      // boundary: a genuinely failed read degrades to "no record yet", which
      // every caller already renders, rather than breaking the page.
      return summarise([]);
    }

    return summarise(
      (legacy.data as unknown as Omit<RawRow, "model_id">[]).map((r) =>
        toSettledRow({ ...r, model_id: null }),
      ),
    );
  });
}

/**
 * The "More predictions" record: each group's settled picks (engine_picks,
 * 0082/0083), tallied like the headline's. Football only; the engine runs
 * on football alone.
 */
export async function groupRecords(): Promise<Map<EngineGroup, SettledRecord>> {
  return cached("settled:groups", 10 * 60_000, async () => {
    const out = new Map<EngineGroup, SettledRecord>();
    const supabase = supabasePublic();
    if (!supabase) return out;
    // Paged for the same reason as settledRecords: one read stops at 1,000 rows.
    let data: { slot: string; result: "win" | "lose" | "push" }[];
    try {
      data = await allPages<{ slot: string; result: "win" | "lose" | "push" }>((from, to) =>
        supabase
          .from("engine_picks")
          .select("slot, result")
          .neq("slot", "headline")
          .not("result", "is", null)
          .order("kickoff", { ascending: false })
          .order("match_id", { ascending: true })
          .order("slot", { ascending: true })
          .range(from, to),
      );
    } catch {
      return out;
    }
    const by = new Map<EngineGroup, { result: "win" | "lose" | "push" }[]>();
    for (const r of data) {
      if (!isEngineGroup(r.slot)) continue;
      by.set(r.slot, [...(by.get(r.slot) ?? []), { result: r.result }]);
    }
    for (const [g, rows] of by) out.set(g, tally(rows.map((r) => ({ league_code: null, market: g, model_id: null, result: r.result }))));
    return out;
  });
}

/**
 * How the last full day of published picks did (matchday.ts), from the
 * public log. Ten minutes: grading runs off the live poll and the cron.
 */
export async function lastMatchday(sport: SportId = DEFAULT_SPORT): Promise<MatchdayRecord | null> {
  return cached(`matchday:last:${sport}`, 10 * 60_000, async () => {
    const supabase = supabasePublic();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("predictions_log")
      .select("kickoff, result")
      .eq("sport", sport)
      .gte("kickoff", new Date(Date.now() - 8 * 86_400_000).toISOString())
      .lt("kickoff", new Date().toISOString())
      .limit(3000);
    if (error || !data) return null;
    return previousMatchday(data as LoggedPick[]);
  });
}
