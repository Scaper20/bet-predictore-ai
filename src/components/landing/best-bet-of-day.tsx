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

  /*
   * Stacked below sm, one row from there.
   *
   * As a single flex row this did not survive a phone. The badge and the
   * right-hand cluster are both intrinsically sized, so the fixture line — the
   * only part that identifies which match this is — absorbed whatever was left
   * over, which at 375 was about ten pixels: the card advertised the best bet
   * of the day as "A…". flex-wrap could not save it, because a min-w-0 flex-1
   * child shrinks to nothing rather than wrapping to the next line.
   */
  return (
    <Link
      href={matchPath(match.id)}
      className="card card-hover flex flex-col gap-3 border-brand/30 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 sm:p-7"
    >
      <Badge tone="brand" className="self-start sm:self-auto">
        Best bet today
      </Badge>
      <div className="min-w-0 flex-1">
        {/* Two lines on a phone, where there is height to spare and no width. */}
        <p className="text-sm text-ink-muted sm:truncate">
          {match.league.name} · {match.home.name} vs {match.away.name}
        </p>
        <p className="mt-0.5 text-base font-semibold">{topPick.label}</p>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end sm:text-right">
        <div>
          <p className="tnum text-lg font-bold text-brand">{percent(topPick.probability, 1)}</p>
          <p className="text-[11px] text-ink-dim">needs {odds(topPick.fairOdds)}+</p>
        </div>
        <Badge tone={topPick.confidence >= 55 ? "brand" : "amber"}>
          {Math.round(topPick.confidence)}/100
        </Badge>
      </div>
    </Link>
  );
}
