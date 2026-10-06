import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import { kickoffTime, percent, relativeDay } from "@/lib/format";
import { Crest } from "@/components/ui/crest";
import { SplitBar } from "@/components/stats/split-bar";
import { Morph, morphName } from "@/components/motion/morph";
import { matchPath } from "@/lib/routes";

/**
 * A fixture's read at a glance: who the model favours (the split bar), the
 * one selection it would stand on, and the price that pick needs to be worth
 * taking. Three small numbers underneath for the goals markets.
 *
 * No confidence score: the split bar already says how one-sided the game
 * is, and a second scale out of 100 next to a percentage read as a second
 * probability.
 */
export function PredictionCard({ prediction, morph = true }: { prediction: Prediction; morph?: boolean }) {
  const { match, markets, topPick, sufficiency } = prediction;
  const publishable = sufficiency.publishable && topPick;

  return (
    <Link
      href={matchPath(match.id)}
      // min-w-0: a grid item defaults to its min-content width, which let a
      // long club name push a 320px screen sideways.
      className="card card-hover group flex min-w-0 flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
        {match.league.logo ? <Crest src={match.league.logo} name={match.league.name} size={16} /> : null}
        <span className="min-w-0 truncate text-xs font-medium text-ink-muted">{match.league.name}</span>
        <span className="tnum ml-auto shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          {relativeDay(match.kickoff)} · {kickoffTime(match.kickoff)}
        </span>
      </div>

      <div className="space-y-2.5 px-4 pt-4 sm:px-5">
        <TeamLine team={match.home} side="home" matchId={match.id} morph={morph} p={markets.home} lead={markets.home >= markets.away && markets.home >= markets.draw} />
        <TeamLine team={match.away} side="away" matchId={match.id} morph={morph} p={markets.away} lead={markets.away > markets.home && markets.away >= markets.draw} />
      </div>

      <div className="px-4 pt-4 sm:px-5">
        <SplitBar home={markets.home} draw={markets.draw} away={markets.away} />
      </div>

      <div className="mt-4 flex-1 border-t border-line bg-surface-2/40 px-4 py-3.5 sm:px-5">
        {publishable ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Our pick</p>
              <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{topPick.label}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum text-[15px] font-bold text-brand">{percent(topPick.probability)}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-dim">
            <span className="font-semibold text-amber">No pick</span> · not enough history yet
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip label="xG" value={markets.expectedGoals.total.toFixed(1)} />
          <Chip label="Over 2.5" value={percent(markets.over["2.5"])} hot={markets.over["2.5"] >= 0.6} />
          <Chip label="GG" value={percent(markets.bttsYes)} hot={markets.bttsYes >= 0.6} />
        </div>
        {publishable && sufficiency.level === "limited" && (
          <p className="mt-2.5 text-[11px] text-amber">Thin data · treat as a guide</p>
        )}
      </div>
    </Link>
  );
}

function TeamLine({
  team,
  side,
  matchId,
  morph,
  p,
  lead,
}: {
  team: Prediction["match"]["home"];
  side: "home" | "away";
  matchId: string;
  morph: boolean;
  p: number;
  lead: boolean;
}) {
  const crest = (
    <span className="inline-flex shrink-0">
      <Crest src={team.crest} name={team.name} size={26} />
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      {morph ? <Morph name={morphName(matchId, side)}>{crest}</Morph> : crest}
      <span className={`min-w-0 flex-1 truncate text-sm ${lead ? "font-semibold text-ink" : "text-ink-muted"}`}>{team.name}</span>
      <span className={`tnum text-sm font-bold ${lead ? "text-brand" : "text-ink-dim"}`}>{percent(p)}</span>
    </div>
  );
}

function Chip({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
        hot ? "border-brand/25 bg-brand/8 text-ink" : "border-line bg-surface text-ink-muted"
      }`}
    >
      <span className="text-ink-dim">{label}</span>
      <span className="tnum font-semibold">{value}</span>
    </span>
  );
}
