import "server-only";

import { LEAGUES } from "@/lib/leagues";
import { parseCountryCsv, parseDivisionCsv, type ArchiveRow } from "@/lib/archive/football-data-uk";
import { storeResults } from "@/lib/archive/history-store";

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

/** football-data.co.uk's season label, e.g. "2627"; their season flips in August. */
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
