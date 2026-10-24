import "server-only";

import { LEAGUES } from "@/lib/leagues";
import { parseCountryCsv, parseDivisionCsv, type ArchiveRow } from "@/lib/archive/football-data-uk";
import { storeResults } from "@/lib/archive/history-store";
import { ESPN_SHOT_LEAGUES, espnDay, matchShots, type ArchiveRow as ShotRow } from "@/lib/archive/espn-shots";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Nightly top-up of the training archive from football-data.co.uk.
 *
 * scripts/backfill-history.ts loads whole seasons once; this keeps them
 * current. Without it the archive froze on the day of the backfill and every
 * prediction in the nine archived leagues trained on results a month stale —
 * missing exactly the recent form the recency weighting exists to emphasise.
 *
 * Free, keyless and idempotent: storeResults skips what is already stored, so
 * a rerun or a double cron fire costs a few downloads and writes nothing.
 */
export async function refreshArchive(
  now = new Date(),
  /** Extra past seasons to (re)load, e.g. ["2425", "2526"], to backfill new columns. */
  backfill: string[] = [],
): Promise<{ fetched: number; added: number }> {
  const seasons = [...new Set([currentSeasonCode(now), ...backfill])];
  const jobs = LEAGUES.filter((l) => l.archive?.footballDataUk || l.archive?.footballDataUkCountry).flatMap(
    (league) => (league.archive?.footballDataUk ? seasons : [seasons[0]]).map(async (season): Promise<ArchiveRow[]> => {
      const div = league.archive?.footballDataUk;
      if (div) {
        const body = await download(`https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`);
        return body ? parseDivisionCsv(body, league.code) : [];
      }
      const country = league.archive!.footballDataUkCountry!;
      const body = await download(`https://www.football-data.co.uk/new/${country.file}.csv`);
      if (!body) return [];
      // The country files hold every season; only the last few months are new.
      const cutoff = now.getTime() - 120 * 86_400_000;
      return parseCountryCsv(body, league.code, country.league).filter((r) => r.kickoff >= cutoff);
    }),
  );

  const rows = (await Promise.all(jobs)).flat();
  const added = await storeResults(rows, "football-data.co.uk");
  return { fetched: rows.length, added };
}

/**
 * Nightly: shots on target from ESPN for the competitions whose archive rows
 * arrive without them (see espn-shots.ts). Runs after refreshArchive so the
 * day's new rows exist; a week back covers results a source stores late.
 */
export async function refreshEspnShots(now = new Date(), days = 7): Promise<{ checked: number; filled: number }> {
  const admin = supabaseAdmin();
  const since = new Date(now.getTime() - (days + 1) * 86_400_000).toISOString();
  let checked = 0;
  let filled = 0;
  for (const [league, slug] of Object.entries(ESPN_SHOT_LEAGUES)) {
    const { data, error } = await admin
      .from("historical_results")
      .select("id, kickoff, home_name, away_name, home_goals, away_goals")
      .eq("league_code", league)
      .is("home_shots_on_target", null)
      .gte("kickoff", since);
    if (error || !data?.length) continue;
    const rows: ShotRow[] = data.map((r) => ({
      id: r.id as string,
      kickoff: Date.parse(r.kickoff as string),
      home: r.home_name as string,
      away: r.away_name as string,
      hg: r.home_goals as number,
      ag: r.away_goals as number,
    }));
    checked += rows.length;
    const games = (
      await Promise.all(Array.from({ length: days + 1 }, (_, i) => espnDay(slug, new Date(now.getTime() - i * 86_400_000)).catch(() => [])))
    ).flat();
    for (const u of matchShots(games, rows)) {
      const { error: writeError } = await admin
        .from("historical_results")
        .update({
          home_shots_on_target: u.hsot,
          away_shots_on_target: u.asot,
          ...(u.hs !== null && u.as !== null ? { home_shots: u.hs, away_shots: u.as } : {}),
        })
        .eq("id", u.id)
        .is("home_shots_on_target", null);
      if (!writeError) filled++;
    }
  }
  return { checked, filled };
}

/** football-data.co.uk's season label, e.g. "2627"; their season flips in August. */
/**
 * The past seasons a run should reload because the archive is missing a
 * column added since they were stored: red cards on their own (0072), which
 * the bookings model needs. Empty once (nearly) every carded row has its
 * reds, so this costs one count query a night after the first backfill.
 */
export async function seasonsMissingReds(now = new Date()): Promise<string[]> {
  const admin = supabaseAdmin();
  const since = new Date(now.getTime() - 1000 * 86_400_000).toISOString();
  const { count, error } = await admin
    .from("historical_results")
    .select("id", { count: "exact", head: true })
    .not("home_cards", "is", null)
    .is("home_reds", null)
    .gte("kickoff", since);
  // A few rows another source stored under other names never get reds; don't reload nightly for them.
  if (error || !count || count < 200) return [];
  const start = Number(currentSeasonCode(now).slice(0, 2));
  return [1, 2, 3].map((back) => `${String(start - back).padStart(2, "0")}${String(start - back + 1).padStart(2, "0")}`);
}

export function currentSeasonCode(now: Date): string {
  const start = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
}

async function download(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
