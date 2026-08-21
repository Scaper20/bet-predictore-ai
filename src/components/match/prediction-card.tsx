import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import { Badge, ProbabilityBar } from "@/components/ui/primitives";
import { kickoffTime, odds, percent, relativeDay } from "@/lib/format";
import { Crest } from "@/components/ui/crest";

/** Richer card for the predictions grid: the model's read, front and centre. */
export function PredictionCard({ prediction }: { prediction: Prediction }) {
  const { match, markets, topPick, sufficiency, model } = prediction;
  const homeLeads = markets.home >= markets.away;

  return (
    <Link
      href={`/match/${encodeURIComponent(match.id)}`}
      className="card card-hover flex flex-col p-5"
    >
      <div className="flex items-center gap-2">
        {match.league.logo ? <Crest src={match.league.logo} name={match.league.name} size={18} /> : null}
        <span className="truncate text-xs font-medium text-ink-muted">{match.league.name}</span>
        <span className="tnum ml-auto shrink-0 text-xs text-ink-dim">
          {relativeDay(match.kickoff)} · {kickoffTime(match.kickoff)}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="flex items-center gap-3">
          <Crest src={match.home.crest} name={match.home.name} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{match.home.name}</span>
          <span className={`tnum text-sm font-bold ${homeLeads ? "text-brand" : "text-ink-muted"}`}>
            {percent(markets.home)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Crest src={match.away.crest} name={match.away.name} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{match.away.name}</span>
          <span className={`tnum text-sm font-bold ${homeLeads ? "text-ink-muted" : "text-brand"}`}>
            {percent(markets.away)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="xG" value={markets.expectedGoals.total.toFixed(2)} />
        <Stat label="O2.5" value={percent(markets.over["2.5"])} />
        <Stat label="BTTS" value={percent(markets.bttsYes)} />
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {sufficiency.publishable && topPick ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Top selection
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{topPick.label}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-ink-dim">Fair odds</p>
                <p className="tnum text-sm font-bold text-brand">{odds(topPick.fairOdds)}</p>
              </div>
            </div>
            <div className="mt-3">
              <ProbabilityBar
                value={topPick.confidence / 100}
                tone={topPick.confidence >= 60 ? "brand" : topPick.confidence >= 40 ? "amber" : "neutral"}
                label="Confidence"
                sublabel={`${Math.round(topPick.confidence)}/100`}
              />
            </div>
            {sufficiency.level === "limited" && (
              <p className="mt-3 text-[11px] leading-relaxed text-amber">
                Thin sample — {model.matchesUsed} matches. Treat as indicative.
              </p>
            )}
          </>
        ) : (
          <div>
            <Badge tone="amber">Insufficient data</Badge>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">{sufficiency.reason}</p>
          </div>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="tnum mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}
