import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import { Badge } from "@/components/ui/primitives";
import { odds, percent } from "@/lib/format";
import { matchPath } from "@/lib/routes";

/**
 * The one deep pick given away free, no login. Headline numbers only — the
 * full panel stack (value, Kelly, Asian handicap, enhanced briefing) still lives
 * behind /match/[id]'s normal gates, so this reads as a hook, not a giveaway
 * of the whole paid experience.
 */
export function BestBetOfDay({ prediction }: { prediction: Prediction | null }) {
  if (!prediction?.topPick) return null;
  const { match, topPick } = prediction;

  return (
    <Link
      href={matchPath(match.id)}
      className="card card-hover flex flex-wrap items-center gap-4 border-brand/30 p-5 sm:p-7"
    >
      <Badge tone="brand">Best bet today</Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-muted">
          {match.league.name} · {match.home.name} vs {match.away.name}
        </p>
        <p className="mt-0.5 text-base font-semibold">{topPick.label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right">
        <div>
          <p className="tnum text-lg font-bold text-brand">{percent(topPick.probability, 1)}</p>
          <p className="text-[11px] text-ink-dim">fair {odds(topPick.fairOdds)}</p>
        </div>
        <Badge tone={topPick.confidence >= 55 ? "brand" : "amber"}>
          {Math.round(topPick.confidence)}/100
        </Badge>
      </div>
    </Link>
  );
}
