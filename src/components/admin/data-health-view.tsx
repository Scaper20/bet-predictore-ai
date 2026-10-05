import type { DataHealth } from "@/lib/data-health";
import { DataLayerForm, SourceToggle } from "@/components/admin/data-layer-form";
import { Badge } from "@/components/ui/primitives";

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export function DataHealthView({ h }: { h: DataHealth }) {

  if (!h.available) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="font-display text-2xl font-bold">Data health</h1>
        <p className="text-sm text-ink-muted">
          Run migrations 0029 and 0030 first. This page reads the scheduled data layer they create.
        </p>
      </div>
    );
  }

  const sourceIds = h.sources.map((s) => s.id).filter((id) => id !== "betrix");

  return (
    <div className="min-w-0 max-w-full space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Data health</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Scheduled jobs (GitHub Actions and a Supabase cron) bring every competition&rsquo;s fixtures, results,
          tables and odds into the database. This page shows how fresh each one is, what failed, and which club
          names no rule could place.
        </p>
      </div>

      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Where pages read sports data</h2>
          <Badge tone={h.dataLayer === "live" ? "neutral" : "brand"}>{h.dataLayer}</Badge>
        </div>
        <DataLayerForm mode={h.dataLayer} />
        <p className="text-xs text-ink-dim">Changes reach every page within about 30 seconds.</p>
      </section>

      <section className="card max-w-full overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Competition</th>
              <th className="px-3 py-3 text-right">Matches</th>
              <th className="px-3 py-3 text-right">Training rows</th>
              {sourceIds.map((id) => (
                <th key={id} className="px-3 py-3">{id}</th>
              ))}
              <th className="px-3 py-3 text-right">Failed 7d</th>
              <th className="px-3 py-3 text-right">Unresolved</th>
              <th className="px-3 py-3 text-right">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {h.competitions.map((c) => (
              <tr key={c.leagueCode} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-dim">updated {ago(c.lastMatchUpdate)}</span>
                </td>
                <td className="tnum px-3 py-2.5 text-right">{c.matchesLoaded.toLocaleString()}</td>
                <td className="tnum px-3 py-2.5 text-right">{c.resultsInTraining.toLocaleString()}</td>
                {sourceIds.map((id) => (
                  <td key={id} className="px-3 py-2.5 text-xs text-ink-muted">{c.lastSuccessBySource[id] ? ago(c.lastSuccessBySource[id]) : "–"}</td>
                ))}
                <td className={`tnum px-3 py-2.5 text-right ${c.failedRuns7d ? "text-rose" : "text-ink-dim"}`}>{c.failedRuns7d}</td>
                <td className={`tnum px-3 py-2.5 text-right ${c.unresolved ? "text-amber" : "text-ink-dim"}`}>{c.unresolved}</td>
                <td className={`tnum px-3 py-2.5 text-right ${c.flaggedGaps ? "text-amber" : "text-ink-dim"}`}>{c.flaggedGaps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-ink">Sources</h2>
          <ul className="divide-y divide-line/60">
            {h.sources.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-4 py-2.5">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    {s.label}
                    {!s.enabled && <Badge tone="amber">Off</Badge>}
                  </span>
                  {s.notes && <span className="block text-xs text-ink-dim">{s.notes}</span>}
                </span>
                {s.id !== "betrix" && <SourceToggle id={s.id} enabled={s.enabled} />}
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-ink">Failed runs, last 7 days</h2>
          {h.recentFailures.length === 0 ? (
            <p className="text-sm text-ink-dim">None.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {h.recentFailures.map((f, i) => (
                <li key={i} className="rounded-lg bg-surface-2 p-2.5">
                  <span className="font-semibold text-ink">{f.job} · {f.source}{f.leagueCode ? ` · ${f.leagueCode}` : ""}</span>
                  <span className="text-ink-dim"> — {ago(f.at)}</span>
                  {f.error && <span className="mt-1 block break-words text-rose">{f.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-ink">Club names no rule could place</h2>
          <p className="text-xs text-ink-dim">
            Games involving these were skipped, never guessed. Add the name to
            <code className="mx-1 break-all">ingestion/betrix_ingest/aliases.json</code>or insert a row in
            <code className="mx-1 break-all">team_aliases</code>and the next run picks it up.
          </p>
          {h.unresolved.length === 0 ? (
            <p className="text-sm text-ink-dim">None.</p>
          ) : (
            <ul className="divide-y divide-line/60 text-sm">
              {h.unresolved.map((u, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className="text-ink">{u.rawName}</span>
                  <span className="text-xs text-ink-dim">{u.source} · {u.scope}{u.leagueCode ? ` · ${u.leagueCode}` : ""} · ×{u.occurrences}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-ink">Possibly the same club twice</h2>
          {h.duplicates.length === 0 ? (
            <p className="text-sm text-ink-dim">None.</p>
          ) : (
            <ul className="divide-y divide-line/60 text-sm">
              {h.duplicates.map((d, i) => (
                <li key={i} className="py-1.5">
                  <span className="text-ink">{d.canonical}</span>
                  <span className="text-ink-dim"> and </span>
                  <span className="text-ink">{d.other}</span>
                  <span className="text-xs text-ink-dim"> ({d.otherSource}, {d.scope})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Known gaps in history</h2>
          <p className="text-xs text-ink-dim">Flagged, not filled: missing matches are never invented.</p>
          {h.gaps.length === 0 ? (
            <p className="text-sm text-ink-dim">None flagged yet.</p>
          ) : (
            <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
              {h.gaps.map((g, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-line/60 py-1.5">
                  <span className="text-ink">{g.leagueCode} {g.season}</span>
                  <span className="text-right text-xs text-ink-dim">{g.note} ({g.source})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
