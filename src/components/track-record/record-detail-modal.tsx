"use client";

import { useEffect, useRef } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { kickoffDay, kickoffTime, odds, percent } from "@/lib/format";
import { isModelId, modelById, ACTIVE_MODEL_ID } from "@/lib/model/registry";

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
  model_id: string | null;
  result: "win" | "lose" | "push" | null;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  settled_at: string | null;
}

const MARKET_LABELS: Record<string, string> = {
  "1x2": "Match result",
  dc: "Double chance",
  ou: "Over / under",
  btts: "Both teams to score",
  cs: "Correct score",
  ah: "Asian handicap",
};

/** Elements that can hold focus, for the tab trap below. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function RecordDetailModal({
  match,
  onClose,
}: {
  match: TrackRecordMatch | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Whatever had focus when the dialog opened, so it can be handed back.
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!match) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Without this, Tab walks straight out of the dialog and into the page
      // behind it, which is still there and still scrollable-to by keyboard.
      const nodes = dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      // Back to the row that opened it, so a keyboard user does not land at
      // the top of the document.
      restoreTo.current?.focus?.();
    };
  }, [match, onClose]);

  if (!match) return null;

  const tone = match.result === "win" ? "brand" : match.result === "lose" ? "rose" : "neutral";
  const family = match.market.split(":")[0];
  const modelId = match.model_id && isModelId(match.model_id) ? match.model_id : ACTIVE_MODEL_ID;
  const model = modelById(modelId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
        className="card relative max-h-[90vh] w-full max-w-lg overflow-y-auto border-line-strong bg-canvas p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="font-semibold text-brand">{match.league}</span>
              <span aria-hidden>·</span>
              <span>
                {kickoffDay(match.kickoff)} at {kickoffTime(match.kickoff)}
              </span>
            </div>
            <h3 id="record-modal-title" className="mt-1 font-display text-xl font-bold text-ink">
              {match.home_name} <span className="font-normal text-ink-muted">vs</span>{" "}
              {match.away_name}
            </h3>
          </div>

          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        <div className="card mt-6 flex items-center justify-between bg-surface-1 p-4">
          <div>
            <p className="text-xs text-ink-muted">Final score</p>
            <p className="tnum font-mono text-2xl font-extrabold text-ink">
              {match.actual_home_goals !== null && match.actual_away_goals !== null
                ? `${match.actual_home_goals} – ${match.actual_away_goals}`
                : "Void"}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-ink-muted">Settlement</p>
            <Badge tone={tone} className="px-3 py-1 text-xs font-bold">
              {match.result?.toUpperCase() ?? "PENDING"}
            </Badge>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            What was published
          </h4>

          {/*
            Four figures, all of them logged before kickoff. The tile that used
            to sit here read "+15% EV" from `probability × fair_odds × 1.15 - 1`
            — and since fair odds are 1/probability by definition, that product
            is always ≈ 1, so the number was a constant dressed as analysis.
          */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Tile label="Market">{MARKET_LABELS[family] ?? family}</Tile>
            <Tile label="Selection" accent>
              {match.label}
            </Tile>
            <Tile label="Model probability" mono>
              {percent(match.probability, 1)}
            </Tile>
            <Tile label="Fair price" mono>
              {odds(match.fair_odds)}
            </Tile>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2 text-xs">
            <span className="text-ink-muted">Model</span>
            <span className="font-semibold text-ink">{model.brandName}</span>
          </div>
        </div>

        <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Logged before kickoff</span> and graded
          automatically against the final score from the match feeds
          {match.settled_at
            ? ` on ${kickoffDay(match.settled_at)} at ${kickoffTime(match.settled_at)}`
            : ""}
          . Nothing is edited after full time.
        </p>

        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} variant="secondary" className="px-5 py-2 text-xs font-semibold">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  children,
  mono = false,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="card space-y-1 p-3">
      <span className="block text-ink-muted">{label}</span>
      <span
        className={`block truncate font-bold ${mono ? "tnum font-mono text-ink" : ""} ${
          accent ? "text-brand" : "text-ink"
        }`}
      >
        {children}
      </span>
    </div>
  );
}
