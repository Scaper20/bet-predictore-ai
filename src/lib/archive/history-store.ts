import "server-only";

import { supabasePublic } from "@/lib/supabase/public";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ArchiveRow } from "@/lib/archive/football-data-uk";
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
  // Grows nightly (refreshArchive) and as live feeds report results. An hour
  // is conservative; the cost of a stale read is one missing matchday.
  return cached(`archive:${leagueCode}`, 60 * 60_000, async () => {
    const supabase = supabasePublic();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("historical_results")
      .select("kickoff, home_name, away_name, home_goals, away_goals, home_shots_on_target, away_shots_on_target")
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
      // Null where the source had none; the fit uses goals alone for those rows.
      homeShotsOnTarget: (r.home_shots_on_target as number | null) ?? undefined,
      awayShotsOnTarget: (r.away_shots_on_target as number | null) ?? undefined,
    }));
  });
}

/**
 * Adds completed matches to the archive, and fills in statistics on ones it
 * already holds.
 *
 * Through upsert_historical_results (0049), keyed on (league, kickoff date,
 * home, away): a new game is inserted; a stored one gets its score refreshed
 * and any corners, cards, shots, shots on target or referee it was missing.
 * A row without a statistic never erases one another source recorded.
 * Returns how many rows were written. Never throws: a failed write only means
 * the archive grows a day later.
 */
export async function storeResults(rows: ArchiveRow[], source: string): Promise<number> {
  const admin = supabaseAdminOrNull();
  if (!admin || rows.length === 0) return 0;

  const payload = rows.map((r) => ({
    league_code: r.leagueCode,
    kickoff: new Date(r.kickoff).toISOString(),
    home_name: r.homeName,
    away_name: r.awayName,
    home_goals: r.homeGoals,
    away_goals: r.awayGoals,
    home_shots_on_target: r.homeShotsOnTarget ?? null,
    away_shots_on_target: r.awayShotsOnTarget ?? null,
    home_corners: r.homeCorners ?? null,
    away_corners: r.awayCorners ?? null,
    home_cards: r.homeCards ?? null,
    away_cards: r.awayCards ?? null,
    home_shots: r.homeShots ?? null,
    away_shots: r.awayShots ?? null,
    referee: r.referee ?? null,
    source,
  }));

  let written = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const { data, error } = await admin.rpc("upsert_historical_results", { p_rows: payload.slice(i, i + 500) });
    if (error) console.error("archive upsert failed:", error.message);
    else written += typeof data === "number" ? data : 0;
  }
  return written;
}

/** One finished match's counts, for the corners/cards/shots model. */
export interface StatRow {
  date: number;
  homeName: string;
  awayName: string;
  corners?: [number, number];
  cards?: [number, number];
  shots?: [number, number];
  shotsOnTarget?: [number, number];
  referee?: string;
}

/**
 * The last ~1,000 days of a competition's results that carry statistics
 * (football-data.co.uk divisions). Empty for competitions without them.
 */
export async function archivedStatRows(leagueCode: string): Promise<StatRow[]> {
  return cached(`archive-stats:${leagueCode}`, 60 * 60_000, async () => {
    const supabase = supabasePublic();
    if (!supabase) return [];
    const since = new Date(Date.now() - 1000 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("historical_results")
      .select(
        "kickoff, home_name, away_name, home_corners, away_corners, home_cards, away_cards, home_shots, away_shots, home_shots_on_target, away_shots_on_target, referee",
      )
      .eq("league_code", leagueCode)
      .gte("kickoff", since)
      .not("home_corners", "is", null)
      .order("kickoff", { ascending: false })
      .limit(MAX_ROWS * 2);
    if (error || !data) return [];
    const pair = (a: unknown, b: unknown): [number, number] | undefined =>
      typeof a === "number" && typeof b === "number" ? [a, b] : undefined;
    return data.map((r) => ({
      date: Date.parse(r.kickoff as string),
      homeName: r.home_name as string,
      awayName: r.away_name as string,
      corners: pair(r.home_corners, r.away_corners),
      cards: pair(r.home_cards, r.away_cards),
      shots: pair(r.home_shots, r.away_shots),
      shotsOnTarget: pair(r.home_shots_on_target, r.away_shots_on_target),
      referee: (r.referee as string | null) ?? undefined,
    }));
  });
}

function supabaseAdminOrNull() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}
