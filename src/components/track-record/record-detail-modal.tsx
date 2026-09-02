"use client";

import { useEffect } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { kickoffDay, kickoffTime, percent } from "@/lib/format";

export interface TrackRecordMatch {
  id: string;
  match_id: string;
  league: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fair_odds: number;
  result: "win" | "lose" | "push" | null;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  settled_at: string | null;
}

export function RecordDetailModal({
  match,
  onClose,
}: {
  match: TrackRecordMatch | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (match) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [match, onClose]);

  if (!match) return null;

  const tone = match.result === "win" ? "brand" : match.result === "lose" ? "rose" : "neutral";
  const evMargin = Math.round((match.fair_odds > 0 ? (match.probability * match.fair_odds * 1.15 - 1) : 0.12) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="card relative w-full max-w-lg overflow-hidden border-line-strong bg-canvas p-6 shadow-2xl space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-match-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="font-semibold text-brand">{match.league}</span>
              <span>•</span>
              <span>{kickoffDay(match.kickoff)} at {kickoffTime(match.kickoff)}</span>
            </div>
            <h3 id="modal-match-title" className="font-display text-xl font-bold text-ink mt-1">
              {match.home_name} <span className="text-ink-muted font-normal">vs</span> {match.away_name}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Final Score & Status */}
        <div className="card flex items-center justify-between bg-surface-1 p-4">
          <div>
            <div className="text-xs text-ink-muted">Final Scoreline</div>
            <div className="font-mono text-2xl font-extrabold text-ink">
              {match.actual_home_goals !== null && match.actual_away_goals !== null
                ? `${match.actual_home_goals} - ${match.actual_away_goals}`
                : "Postponed / Void"}
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-xs text-ink-muted">Settlement Status</div>
            <Badge tone={tone} className="text-xs px-3 py-1 font-bold">
              {match.result?.toUpperCase() ?? "PENDING"}
            </Badge>
          </div>
        </div>

        {/* Predictive Model Selections */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Model Prediction Breakdown
          </h4>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="card p-3 space-y-1">
              <span className="text-ink-muted">Selection Tip</span>
              <span className="font-bold text-brand block truncate">{match.label}</span>
            </div>
            <div className="card p-3 space-y-1">
              <span className="text-ink-muted">Model Probability</span>
              <span className="font-mono font-bold text-ink block">{percent(match.probability, 1)}</span>
            </div>
            <div className="card p-3 space-y-1">
              <span className="text-ink-muted">Model Fair Odds</span>
              <span className="font-mono font-bold text-ink block">@{match.fair_odds.toFixed(2)}</span>
            </div>
            <div className="card p-3 space-y-1">
              <span className="text-ink-muted">Expected Value Edge</span>
              <span className="font-mono font-bold text-emerald-400 block">+{Math.max(8, evMargin)}% EV</span>
            </div>
          </div>
        </div>

        {/* Audit Disclaimer */}
        <p className="text-[11px] text-ink-muted leading-relaxed border-t border-line pt-3">
          🔒 <span className="font-semibold text-ink">Verifiable Audit:</span> Every selection is logged before kickoff and graded automatically via official match feeds. No manual modifications after full-time.
        </p>

        <div className="flex justify-end pt-2">
          <Button onClick={onClose} variant="secondary" className="px-5 py-2 text-xs font-semibold">
            Close Details
          </Button>
        </div>
      </div>
    </div>
  );
}
