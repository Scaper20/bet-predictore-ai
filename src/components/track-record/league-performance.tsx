import { leagueByCode } from "@/lib/leagues";
import { percent } from "@/lib/format";
import { MIN_PUBLISHABLE_SAMPLE, isPublishable, type SettledRecord } from "@/lib/performance";

/**
 * The record broken out by competition.
 *
 * This could not exist before 0013. predictions_log stored the competition as
 * whichever display name the answering feed used — "Premier League" from one,
 * "English Premier League" from another, "Primera Division" and "La Liga" for
 * the same Spanish fixtures — so grouping produced buckets that were partly
 * about which provider happened to reply. Keyed on the catalogue code, the
 * groups are about the competition.
 *
 * Two honesty rules, both the same one applied twice: a competition under
 * MIN_PUBLISHABLE_SAMPLE shows its raw record and no rate, and picks from
 * competitions outside the catalogue are counted openly at the foot rather
 * than dropped from a page whose whole claim is that nothing is dropped.
 */

export interface LeagueRecordRow {
  code: string;
  record: SettledRecord;
}

export function LeaguePerformance({
  rows,
  uncatalogued,
}: {
  rows: LeagueRecordRow[];
  uncatalogued: SettledRecord;
}) {
  if (rows.length === 0 && uncatalogued.sample === 0) return null;

  // Publishable first and by strength within that, then the rest by sample —
  // a reader should meet the rows that mean something before the thin ones.
  const ordered = [...rows].sort((a, b) => {
    const pa = isPublishable(a.record);
    const pb = isPublishable(b.record);
    if (pa !== pb) return pa ? -1 : 1;
    if (pa) return (b.record.winRate ?? 0) - (a.record.winRate ?? 0);
    return b.record.sample - a.record.sample;
  });

  return (
    <section className="space-y-4">
      <div className="border-b border-line pb-3">
        <h2 className="font-display text-xl font-bold tracking-tight">By competition</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Where the settled picks came from. No rate is shown until a competition has{" "}
          {MIN_PUBLISHABLE_SAMPLE} graded picks of its own.
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ code, record }) => {
          const league = leagueByCode(code);
          const publishable = isPublishable(record);
          return (
            <li
              key={code}
              className="card flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {league?.flag && (
                    <span className="mr-1.5" aria-hidden>
                      {league.flag}
                    </span>
                  )}
                  {league?.shortName ?? code}
                </p>
                <p className="tnum mt-0.5 text-xs text-ink-muted">
                  {record.wins}–{record.losses}
                  {record.pushes > 0 && <span>–{record.pushes}</span>}{" "}
                  <span>from {record.sample} graded</span>
                </p>
              </div>

              <span
                className={`tnum shrink-0 font-mono text-base font-extrabold ${
                  publishable ? "text-ink" : "text-ink-dim"
                }`}
              >
                {publishable ? percent(record.winRate ?? 0) : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      {uncatalogued.sample > 0 && (
        <p className="text-xs leading-relaxed text-ink-muted">
          A further {uncatalogued.sample} graded {uncatalogued.sample === 1 ? "pick" : "picks"} (
          {uncatalogued.wins}–{uncatalogued.losses}) came from competitions outside our tracked
          list — the feeds carry far more football than we catalogue. They count towards the
          overall record above and simply have no competition of their own to sit under.
        </p>
      )}
    </section>
  );
}
