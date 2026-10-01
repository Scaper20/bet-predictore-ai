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

/**
 * Adds completed matches to the archive, skipping any it already holds.
 *
 * The natural key is an expression index (league, kickoff date, home, away),
 * which PostgREST cannot name as an upsert target, so duplicates are filtered
 * here against what is already stored in the same date range before inserting.
 * Returns how many rows were new. Never throws: a failed write only means the
 * archive grows a day later.
 */
export async function storeResults(rows: ArchiveRow[], source: string): Promise<number> {
  const admin = supabaseAdminOrNull();
  if (!admin || rows.length === 0) return 0;

  const key = (league: string, kickoff: number, home: string, away: string) =>
    `${league}|${new Date(kickoff).toISOString().slice(0, 10)}|${home}|${away}`;

  let added = 0;
  const byLeague = new Map<string, ArchiveRow[]>();
  for (const r of rows) {
    const list = byLeague.get(r.leagueCode) ?? [];
    list.push(r);
    byLeague.set(r.leagueCode, list);
  }

  for (const [league, list] of byLeague) {
    const from = Math.min(...list.map((r) => r.kickoff)) - 86_400_000;
    const to = Math.max(...list.map((r) => r.kickoff)) + 86_400_000;
    const { data: existing, error } = await admin
      .from("historical_results")
      .select("kickoff, home_name, away_name")
      .eq("league_code", league)
      .gte("kickoff", new Date(from).toISOString())
      .lte("kickoff", new Date(to).toISOString())
      .limit(5000);
    if (error) continue;

    const seen = new Set(
      (existing ?? []).map((e) => key(league, Date.parse(e.kickoff as string), e.home_name as string, e.away_name as string)),
    );
    const fresh: Record<string, unknown>[] = [];
    for (const r of list) {
      const k = key(league, r.kickoff, r.homeName, r.awayName);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push({
        league_code: league,
        kickoff: new Date(r.kickoff).toISOString(),
        home_name: r.homeName,
        away_name: r.awayName,
        home_goals: r.homeGoals,
        away_goals: r.awayGoals,
        source,
      });
    }
    for (let i = 0; i < fresh.length; i += 500) {
      const { error: insertError } = await admin.from("historical_results").insert(fresh.slice(i, i + 500));
      if (insertError) console.error(`archive insert ${league} failed:`, insertError.message);
      else added += Math.min(500, fresh.length - i);
    }
  }
  return added;
}

function supabaseAdminOrNull() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}
