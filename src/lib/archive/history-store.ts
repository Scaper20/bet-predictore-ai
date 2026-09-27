import "server-only";

import { supabasePublic } from "@/lib/supabase/public";
import { cached } from "@/lib/providers/cache";
import type { ResultRow } from "@/lib/types";

/**
 * Reads the training archive that scripts/backfill-history.ts fills.
 *
 * This is the answer to the measurement that started it: through the live
 * providers alone, every competition in the catalogue trained on 15-35
 * completed matches, and the backtest puts the model at 51.6% accuracy at that
 * depth against 66.3% on full history. No free live tier closes that gap —
 * TheSportsDB's public key truncates a season to about fifteen rows, and
 * SportAPI7 allows fifty requests a month. Storing finished results and
 * reading them from Postgres does, because a completed match never changes.
 *
 * Reads through supabasePublic() rather than the service-role client: these
 * rows are public sports data with a public SELECT policy, and nothing here
 * needs to escape RLS.
 */

/**
 * How many completed matches to hand the fit.
 *
 * Two full seasons of a 20-team league is 760. The fit already weights by
 * recency with a 180-day half-life, so older rows contribute very little and
 * mostly cost memory — but they cost nothing in accuracy, and the cap exists
 * to bound the query rather than to shape the model.
 */
const MAX_ROWS = 1200;

export async function archivedResults(leagueCode: string): Promise<ResultRow[]> {
  // Changes only when the backfill runs, which is manual and rare. An hour is
  // conservative; the cost of a stale read is one missing matchday.
  return cached(`archive:${leagueCode}`, 60 * 60_000, async () => {
    const supabase = supabasePublic();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("historical_results")
      .select("kickoff, home_name, away_name, home_goals, away_goals")
      .eq("league_code", leagueCode)
      .order("kickoff", { ascending: false })
      .limit(MAX_ROWS);

    // A missing table (0014 not applied yet) or a failed read degrades to "no
    // archive", and the caller falls back to the live providers exactly as it
    // did before this module existed. Training data is a quality input, never
    // an availability requirement.
    if (error || !data) return [];

    return data.map((r) => ({
      // The fit keys teams on normaliseKey(name), so the name is the identity
      // that matters. Archives carry no stable club id and inventing one would
      // just be the name again with extra steps.
      homeId: r.home_name as string,
      awayId: r.away_name as string,
      homeName: r.home_name as string,
      awayName: r.away_name as string,
      homeGoals: r.home_goals as number,
      awayGoals: r.away_goals as number,
      date: Date.parse(r.kickoff as string),
      leagueId: leagueCode,
    }));
  });
}
