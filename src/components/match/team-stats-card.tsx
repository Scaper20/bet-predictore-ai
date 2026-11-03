import type { TeamStatRow } from "@/lib/match-details-core";
import type { Match } from "@/lib/types";
import { Crest } from "@/components/ui/crest";
import { CompareRow } from "./match-stats";

/**
 * This game's team stats side by side: possession as one shared bar, then
 * every other measure as two bars growing out from the middle, the better
 * side lit (fewer is better for fouls and cards).
 */
export function TeamStatsCard({ match, rows, live }: { match: Match; rows: TeamStatRow[]; live: boolean }) {
  if (rows.length === 0) return null;
  const possession = rows.find((r) => r.key === "possession");
  const rest = rows.filter((r) => r.key !== "possession");
  const fmt = (r: TeamStatRow) => (v: number) => (r.format === "pct" ? `${Math.round(v)}%` : r.format === "dec" ? v.toFixed(2) : String(Math.round(v)));

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <span className="flex min-w-0 items-center gap-2">
          <Crest src={match.home.crest} name={match.home.name} size={20} />
          <span className="truncate text-xs font-semibold">{match.home.name}</span>
        </span>
        <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">{live ? "This match, live" : "This match"}</span>
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-xs font-semibold">{match.away.name}</span>
          <Crest src={match.away.crest} name={match.away.name} size={20} />
        </span>
      </div>
      <div className="space-y-4 px-5 py-5">
        {possession && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="tnum font-bold">{Math.round(possession.home)}%</span>
              <span className="text-xs text-ink-muted">Possession</span>
              <span className="tnum font-bold">{Math.round(possession.away)}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
              <span className="seg-grow block h-full bg-brand" style={{ width: `${possession.home}%` }} />
              <span className="seg-grow block h-full bg-cyan" style={{ width: `${possession.away}%`, transformOrigin: "right", animationDelay: "80ms" }} />
            </div>
          </div>
        )}
        {rest.map((r, i) => (
          <CompareRow key={r.key} label={r.label} h={r.home} a={r.away} fmt={fmt(r)} lowerIsBetter={!r.higherIsBetter} index={i + 1} />
        ))}
      </div>
    </section>
  );
}
