import "server-only";

import { supabasePublic } from "@/lib/supabase/public";
import { cached } from "@/lib/providers/cache";
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

/**
 * Settled picks for a sport, optionally windowed.
 *
 * IMPORTANT for callers: `byLeague` is keyed on the league display name, not
 * its code. settlement-runner.ts writes `league: m.league.name`, so a caller
 * holding a LeagueDef must look up `def.name` — `def.code` silently misses
 * every time and reads as "no record yet".
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

    let query = supabase
      .from("predictions_log")
      .select("league, market, model_id, result")
      .eq("sport", sport)
      .not("settled_at", "is", null)
      .not("result", "is", null)
      // Defensive cap, matching admin-analytics. Not expected to bind at this
      // app's volume, but an unbounded select on a public page should not be
      // one busy season away from a problem.
      .limit(5000);

    if (sinceDays !== undefined) {
      const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      query = query.gte("kickoff", cutoff);
    }

    const { data, error } = await query;
    // Performance figures are a trust surface, never an authorization
    // boundary: a failed read degrades to "no record yet", which every caller
    // already renders, rather than breaking the page.
    if (error || !data) return summarise([]);

    return summarise(data as SettledRow[]);
  });
}
