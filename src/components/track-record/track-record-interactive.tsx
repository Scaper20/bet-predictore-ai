"use client";

import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { kickoffDay, percent } from "@/lib/format";
import { leagueByProviderName } from "@/lib/leagues";
import { RecordDetailModal, type TrackRecordMatch } from "./record-detail-modal";

const INITIAL_LIMIT = 20;

const ALL = "__all__";

/**
 * One competition, as this list groups them.
 *
 * Rows written before 0013 have no league_code, and the display string is the
 * answering provider's, so the code is recovered through the same alias table
 * the aggregates use. A competition outside the catalogue keeps its own name
 * and its own group rather than being folded into a neighbour it merely shares
 * a word with — "Argentinian Primera Division" is not Spain.
 */
function groupOf(row: TrackRecordMatch): { key: string; label: string } {
  const def = leagueByProviderName(row.league);
  return def ? { key: def.code, label: def.shortName } : { key: row.league, label: row.league };
}

/**
 * The settled log.
 *
 * Previously this also rendered the model-performance section; that is now
 * server-rendered from real aggregates and sits above this component, so this
 * one does the single job its name implies.
 */
export function TrackRecordInteractive({ rows }: { rows: TrackRecordMatch[] }) {
  const [selected, setSelected] = useState<TrackRecordMatch | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [league, setLeague] = useState<string>(ALL);

  const competitions = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const row of rows) {
      const { key, label } = groupOf(row);
      const cur = counts.get(key);
      if (cur) cur.n++;
      else counts.set(key, { label, n: 1 });
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);

  const filtered = useMemo(
    () => (league === ALL ? rows : rows.filter((r) => groupOf(r).key === league)),
    [rows, league],
  );

  const visible = expanded ? filtered : filtered.slice(0, INITIAL_LIMIT);
  const hasMore = filtered.length > INITIAL_LIMIT;

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-2 border-b border-line pb-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Graded results</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Showing {visible.length} of {filtered.length} settled{" "}
            {filtered.length === 1 ? "fixture" : "fixtures"}
            {league !== ALL && ` in ${competitions.find(([k]) => k === league)?.[1].label ?? ""}`}.
            Select any row for what was published before kickoff.
          </p>
        </div>

        {/* One control, not the two differently-labelled copies of the same
            toggle that used to bracket this list. */}
        <div className="flex flex-wrap items-center gap-2">
          {competitions.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="sr-only">Filter by competition</span>
              <select
                value={league}
                onChange={(e) => {
                  setLeague(e.target.value);
                  // A filter that leaves the list expanded from a previous,
                  // longer selection strands the reader mid-scroll.
                  setExpanded(false);
                }}
                /* min-h-9 because py-1.5 put this at 30px tall — under any
                   touch guideline, and it is the only control on the page. */
                className="min-h-9 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink outline-none focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <option value={ALL}>All competitions ({rows.length})</option>
                {competitions.map(([key, { label, n }]) => (
                  <option key={key} value={key}>
                    {label} ({n})
                  </option>
                ))}
              </select>
            </label>
          )}

          {hasMore && (
            <Button
              onClick={() => setExpanded((v) => !v)}
              variant="secondary"
              className="px-4 py-1.5 text-xs font-semibold"
            >
              {expanded ? `Show first ${INITIAL_LIMIT}` : `Show all ${filtered.length}`}
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-3">
        {visible.map((row) => {
          const tone = row.result === "win" ? "brand" : row.result === "lose" ? "rose" : "neutral";
          return (
            <li key={row.id}>
              {/* A real button: keyboard handling, focus ring and semantics
                  come free, where the div[role=button] needed all three by
                  hand and only got two. */}
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="card group flex w-full flex-wrap items-center gap-4 p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-1 sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span className="font-semibold text-brand">{row.league}</span>
                    <span aria-hidden>·</span>
                    <span>{kickoffDay(row.kickoff)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-ink transition-colors group-hover:text-brand">
                    {row.home_name} <span className="font-normal text-ink-muted">vs</span>{" "}
                    {row.away_name}
                    {row.actual_home_goals !== null && row.actual_away_goals !== null && (
                      <span className="tnum ml-2 font-bold text-ink">
                        ({row.actual_home_goals}-{row.actual_away_goals})
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Pick: <span className="font-semibold text-ink">{row.label}</span>{" "}
                    <span className="tnum">({percent(row.probability, 1)})</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={tone} className="px-3 py-1 font-bold">
                    {row.result?.toUpperCase() ?? "PENDING"}
                  </Badge>
                  <span
                    className="text-xs text-ink-muted transition-colors group-hover:text-ink"
                    aria-hidden
                  >
                    Details →
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <RecordDetailModal match={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
