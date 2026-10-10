import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import { Crest } from "@/components/ui/crest";
import { SplitBar } from "@/components/stats/split-bar";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { LocalTime } from "@/components/ui/local-time";
import { matchPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import { StrongBadge } from "@/components/ui/strong-badge";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import type { ViewedPrediction } from "@/lib/access";
import { PickAction } from "@/components/match/pick-action";

/**
 * The one deep pick given away free, no login. Headline numbers only — the
 * full panel stack still lives behind the match page's normal gates, so this
 * reads as a hook, not the whole paid experience. Always one of today's
 * games (bestBetOfDay), with a slip button like every pick card. Its border slowly orbits
 * (.orbit-border) so it reads as the day's headline without shouting.
 */
export function BestBetOfDay({ prediction }: { prediction: Prediction | ViewedPrediction | null }) {
  if (!prediction?.topPick) return null;
  const { match, topPick, markets } = prediction;
  const locked = "locked" in prediction && prediction.locked.pick;

  return (
    <article className="orbit-border card card-hover group grid gap-5 overflow-hidden rounded-2xl p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:p-7">
      <Link href={matchPath(match.id)} className="block min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-ink">
            <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
              <path d="M8 1.5 9.9 5.6l4.4.5-3.3 3 1 4.4L8 11.3 4 13.5l1-4.4-3.3-3 4.4-.5Z" />
            </svg>
            Best bet today
          </span>
          <span className="truncate text-xs text-ink-muted">
            {match.league.name} · <LocalTime iso={match.kickoff} kind="relative" /> <LocalTime iso={match.kickoff} />
          </span>
        </div>

        <div className="mt-4 flex min-w-0 items-center gap-3">
          <Crest src={match.home.crest} name={match.home.name} size={30} />
          <p className="min-w-0 truncate font-display text-lg font-bold sm:text-xl">
            {match.home.name} <span className="font-sans text-sm font-medium text-ink-dim">v</span> {match.away.name}
          </p>
          <Crest src={match.away.crest} name={match.away.name} size={30} />
        </div>

        <div className="mt-4 max-w-md">
          <SplitBar home={markets.home} draw={markets.draw} away={markets.away} />
        </div>
      </Link>

      <div className="flex items-end justify-between gap-6 rounded-xl border border-brand/20 bg-brand/[0.06] px-5 py-4 sm:block sm:min-w-52 sm:text-right">
        <Link href={matchPath(match.id)} className="block">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">Our pick</p>
          {locked ? (
            <LockedSelection group={topPick.group} className="mt-1 text-base font-bold text-ink sm:text-lg" />
          ) : (
            <p className="mt-1 text-base font-bold text-ink sm:text-lg">{topPick.label}</p>
          )}
          {isStrong(topPick) && <StrongBadge className="mt-1.5" />}
        </Link>
        <div className="flex flex-col items-end gap-2 sm:mt-3">
          {locked ? (
            <ProTag />
          ) : (
            <AnimatedNumber value={topPick.probability * 100} decimals={1} suffix="%" className="font-mono tracking-tight text-2xl font-semibold text-brand" />
          )}
          <PickAction match={match} pick={topPick} locked={locked} />
        </div>
      </div>
    </article>
  );
}
