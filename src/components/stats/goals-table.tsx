"use client";

import { useMemo, useState } from "react";
import { Crest } from "@/components/ui/crest";
import type { GoalProfile } from "@/lib/stats/compute";

export interface GoalsRow {
  id: string;
  name: string;
  crest?: string;
  g: GoalProfile;
}

type Key = "over15" | "over25" | "over35" | "btts" | "cleanSheets" | "failedToScore" | "scored" | "conceded";

const COLS: { key: Key; label: string; short: string; pct: boolean; hint: string }[] = [
  { key: "over25", label: "Over 2.5", short: "O2.5", pct: true, hint: "Games with three or more goals" },
  { key: "btts", label: "Both scored", short: "GG", pct: true, hint: "Games where both teams scored" },
  { key: "over15", label: "Over 1.5", short: "O1.5", pct: true, hint: "Games with two or more goals" },
  { key: "over35", label: "Over 3.5", short: "O3.5", pct: true, hint: "Games with four or more goals" },
  { key: "cleanSheets", label: "Clean sheets", short: "CS", pct: true, hint: "Games without conceding" },
  { key: "failedToScore", label: "Failed to score", short: "FTS", pct: true, hint: "Games without scoring" },
  { key: "scored", label: "Scored / game", short: "GF", pct: false, hint: "Goals scored per game" },
  { key: "conceded", label: "Conceded / game", short: "GA", pct: false, hint: "Goals conceded per game" },
];

/**
 * Every club's goal rates, sortable by any column. Cells are shaded by how
 * high the value is against the column's range, so the high and low
 * scorers stand out before any number is read.
 */
export function GoalsTable({ rows }: { rows: GoalsRow[] }) {
  const [sort, setSort] = useState<Key>("over25");
  const [asc, setAsc] = useState(false);

  const ranges = useMemo(() => {
    const out = {} as Record<Key, [number, number]>;
    for (const c of COLS) {
      const vals = rows.map((r) => r.g[c.key]);
      out[c.key] = [Math.min(...vals), Math.max(...vals)];
    }
    return out;
  }, [rows]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (asc ? a.g[sort] - b.g[sort] : b.g[sort] - a.g[sort]) || a.name.localeCompare(b.name)),
    [rows, sort, asc],
  );

  const choose = (k: Key) => {
    if (k === sort) setAsc((v) => !v);
    else {
      setSort(k);
      setAsc(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-surface py-3 pl-4 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim sm:pl-5">Team</th>
            <th className="w-10 py-3 text-center text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">GP</th>
            {COLS.map((c) => (
              <th key={c.key} className="w-16 py-2 text-center">
                <button
                  type="button"
                  onClick={() => choose(c.key)}
                  title={c.hint}
                  className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider transition-colors ${
                    sort === c.key ? "bg-brand/12 text-brand" : "text-ink-dim hover:text-ink"
                  }`}
                >
                  {c.short}
                  {sort === c.key && <span aria-hidden>{asc ? "↑" : "↓"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/40">
              <td className="sticky left-0 z-10 bg-surface py-2.5 pl-4 pr-3 sm:pl-5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Crest src={r.crest} name={r.name} size={20} />
                  <span className="max-w-[9rem] truncate font-medium sm:max-w-[14rem]">{r.name}</span>
                </span>
              </td>
              <td className="tnum py-2.5 text-center text-ink-dim">{r.g.played}</td>
              {COLS.map((c) => {
                const [lo, hi] = ranges[c.key];
                const t = hi > lo ? (r.g[c.key] - lo) / (hi - lo) : 0.5;
                return (
                  <td key={c.key} className="px-1 py-1.5 text-center">
                    <span
                      className={`tnum block rounded-md py-1.5 transition-colors duration-500 ${sort === c.key ? "font-bold text-ink" : "text-ink-muted"}`}
                      style={{ background: `color-mix(in oklab, var(--color-brand) ${Math.round(t * 28)}%, transparent)` }}
                    >
                      {c.pct ? `${Math.round(r.g[c.key] * 100)}%` : r.g[c.key].toFixed(1)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
