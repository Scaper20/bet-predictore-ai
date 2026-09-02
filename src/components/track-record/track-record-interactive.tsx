"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { kickoffDay, percent } from "@/lib/format";
import { RecordDetailModal, type TrackRecordMatch } from "./record-detail-modal";
import { ScalableModelPerformance } from "./scalable-model-performance";

export function TrackRecordInteractive({ rows }: { rows: TrackRecordMatch[] }) {
  const [selectedMatch, setSelectedMatch] = useState<TrackRecordMatch | null>(null);
  const [expanded, setExpanded] = useState(false);

  const INITIAL_LIMIT = 20;
  const visibleRows = expanded ? rows : rows.slice(0, INITIAL_LIMIT);
  const hasMore = rows.length > INITIAL_LIMIT;

  return (
    <div className="space-y-10">
      {/* Scalable Model Performance Section */}
      <ScalableModelPerformance />

      {/* Match History Log Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight">
              📜 Graded Match Results Log
            </h2>
            <p className="text-xs text-ink-muted">
              Showing {visibleRows.length} of {rows.length} settled fixtures. Click any row for deep model analysis.
            </p>
          </div>

          {hasMore && (
            <Button
              onClick={() => setExpanded((v) => !v)}
              variant="secondary"
              className="px-4 py-1.5 text-xs font-semibold self-start sm:self-auto"
            >
              {expanded ? "Show Less (First 20)" : `Show All ${rows.length} Records ↓`}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {visibleRows.map((row) => {
            const tone = row.result === "win" ? "brand" : row.result === "lose" ? "rose" : "neutral";
            return (
              <div
                key={row.id}
                onClick={() => setSelectedMatch(row)}
                className="card flex flex-wrap items-center gap-4 p-4 sm:p-5 hover:border-line-strong hover:bg-surface-1 cursor-pointer transition-all group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedMatch(row);
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span className="font-semibold text-brand">{row.league}</span>
                    <span>·</span>
                    <span>{kickoffDay(row.kickoff)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-ink group-hover:text-brand transition-colors">
                    {row.home_name} <span className="text-ink-muted font-normal">vs</span> {row.away_name}
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

                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={tone} className="px-3 py-1 font-bold">
                    {row.result?.toUpperCase() ?? "PENDING"}
                  </Badge>
                  <span className="text-xs text-ink-muted group-hover:text-ink transition-colors">
                    Details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button
              onClick={() => setExpanded((v) => !v)}
              variant="secondary"
              className="px-6 py-2.5 text-xs font-semibold shadow-xs"
            >
              {expanded ? "Minimize to 20 Records" : `Expand All ${rows.length} Match Records ↓`}
            </Button>
          </div>
        )}
      </section>

      {/* Interactive Detail Modal */}
      <RecordDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />
    </div>
  );
}
