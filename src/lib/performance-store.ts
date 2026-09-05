import "server-only";

import { supabasePublic } from "@/lib/supabase/public";
import { cached } from "@/lib/providers/cache";
import { leagueByProviderName } from "@/lib/leagues";
import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import { summarise, type SettledBreakdown, type SettledRow } from "@/lib/performance";

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

    const run = async (columns: string) => {
      let query = supabase
        .from("predictions_log")
        .select(columns)
        .eq("sport", sport)
        .not("settled_at", "is", null)
        .not("result", "is", null)
        // Defensive cap, matching admin-analytics. Not expected to bind at
        // this app's volume, but an unbounded select on a public page should
        // not be one busy season away from a problem.
        .limit(5000);

      if (cutoff) query = query.gte("kickoff", cutoff);
      return query;
    };

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
