import type { DataHealth } from "@/lib/data-health";
import { DataLayerForm, SourceToggle } from "@/components/admin/data-layer-form";
import { Badge } from "@/components/ui/primitives";
import { SwitchForm } from "@/components/admin/switch-form";

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

export function DataHealthView({ h, fotmobUi = true }: { h: DataHealth; fotmobUi?: boolean }) {

  if (!h.available) {
    return (
      <div className="max-w-2xl space-y-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Product</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Data health</h1>
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
        <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">Product</p>
        <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">Data health</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Scheduled jobs (GitHub Actions and a Supabase cron) bring every competition&rsquo;s fixtures, results,
          tables and prices into the database. This page shows how fresh each one is, what failed, and which club
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

      {h.fotmob && (
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Match details (FotMob)</h2>
            <span className="text-xs text-ink-dim">
              Lineups {ago(h.fotmob.lastUpcomingRun)} · club profiles {ago(h.fotmob.lastTeamsRun)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Games with details", h.fotmob.matchesWithDetails],
                ["Players", h.fotmob.players],
                ["Club profiles", h.fotmob.clubProfiles],
                ["Absence snapshots", h.fotmob.absenceSnapshots],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                <p className="text-[10.5px] uppercase tracking-wider text-ink-dim">{label}</p>
                <p className="tnum mt-1 font-mono text-lg font-semibold">{n.toLocaleString("en-GB")}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-dim">
            Player profiles {h.fotmob.playerProfiles === null ? "–" : h.fotmob.playerProfiles.toLocaleString("en-GB")}
            {" · "}
            {h.fotmob.props ? (
              <>
                Player props {ago(h.fotmob.props.at)} ({h.fotmob.props.status}): {h.fotmob.props.matches} games, {h.fotmob.props.projections} projections,{" "}
                {h.fotmob.props.lines} SportyBet lines,{" "}
                <span className={h.fotmob.props.starters && h.fotmob.props.startersWithLines / h.fotmob.props.starters < 0.9 ? "text-amber" : ""}>
                  {h.fotmob.props.startersWithLines} of {h.fotmob.props.starters} starters with lines
                </span>
                {" "}({h.fotmob.props.unmatched} bookmaker lines for players outside the eleven),{" "}
                <span className={h.fotmob.props.skippedMarkets ? "text-amber" : ""}>{h.fotmob.props.skippedMarkets} unreadable player markets</span>,{" "}
                {h.fotmob.props.picks} picks, {h.fotmob.props.settled} settled
              </>
            ) : (
              "player props have not run yet"
            )}
          </p>
          {h.fotmob.leagues.length > 0 && (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-dim">
                    <th className="py-2 pr-3 font-medium">Competition</th>
                    <th className="py-2 pr-3 font-medium">Last run</th>
                    <th className="py-2 pr-3 text-right font-medium">Linked</th>
                    <th className="py-2 pr-3 text-right font-medium">Fetched</th>
                    <th className="py-2 pr-3 text-right font-medium">Left</th>
                    <th className="py-2 font-medium">Not linked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {h.fotmob.leagues.map((l) => (
                    <tr key={l.leagueCode}>
                      <td className="py-2 pr-3 font-medium text-ink">
                        {l.leagueCode}
                        {l.season && <span className="ml-1.5 text-xs text-ink-dim">{l.season}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-ink-muted">
                        {ago(l.at)} {l.status !== "ok" && <Badge tone="amber">{l.status}</Badge>}
                      </td>
                      <td className="tnum py-2 pr-3 text-right font-mono">{l.linked}</td>
                      <td className="tnum py-2 pr-3 text-right font-mono">{l.fetched}</td>
                      <td className="tnum py-2 pr-3 text-right font-mono">{l.remaining}</td>
                      <td className="max-w-xs truncate py-2 text-xs text-ink-dim" title={l.warning ?? undefined}>
                        {l.unmatched > 0 ? `${l.unmatched}: ${l.warning ?? ""}` : "none"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-dim">
            Games FotMob has that no match row fits are left unlinked, never guessed: add the spelling to
            ingestion/betrix_ingest/aliases.json.
          </p>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="text-xs text-ink-muted">
              Lineups, timelines, shot maps and club profiles on the site: {fotmobUi ? <Badge tone="brand">Showing</Badge> : <Badge tone="amber">Hidden</Badge>}
            </span>
            <SwitchForm switchKey="fotmob_ui" enabled={fotmobUi} onLabel="Show FotMob sections" offLabel="Hide FotMob sections" />
          </div>
        </section>
      )}

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
