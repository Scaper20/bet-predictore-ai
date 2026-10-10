import Link from "next/link";
import type { Prediction } from "@/lib/model/predict";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { Crest } from "@/components/ui/crest";
import { SplitBar } from "@/components/stats/split-bar";
import { Morph, morphName } from "@/components/motion/morph";
import { matchPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import { StrongBadge } from "@/components/ui/strong-badge";
import { LockedSelection, ProTag } from "@/components/entitlements/locked-pick";
import type { ViewedPrediction } from "@/lib/access";
import { PickAction } from "@/components/match/pick-action";

/**
 * A fixture's read at a glance: each side's chance, the one selection the
 * model would stand on, and a button that puts it on the slip (the live
 * score once the game is under way). The split bar and goals numbers fold
 * away under "More".
 *
 * No confidence score: the split bar already says how one-sided the game
 * is, and a second scale out of 100 next to a percentage read as a second
 * probability.
 */
export function PredictionCard({ prediction, morph = true }: { prediction: Prediction | ViewedPrediction; morph?: boolean }) {
  const { match, markets, topPick, sufficiency } = prediction;
  const publishable = sufficiency.publishable && topPick;
  // Free viewers get every match, but non-1X2 picks and markets arrive
  // already locked from the server (lib/access.ts); the card only shows it.
  const locked = "locked" in prediction ? prediction.locked : { pick: false, markets: false };

  return (
    // min-w-0: a grid item defaults to its min-content width, which let a
    // long club name push a 320px screen sideways.
    <article className="card card-hover group flex min-w-0 flex-col overflow-hidden">
      <Link href={matchPath(match.id)} className="block flex-1">
        <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
          {match.league.logo ? <Crest src={match.league.logo} name={match.league.name} size={16} /> : null}
          <span className="min-w-0 truncate text-xs font-medium text-ink-muted">{match.league.name}</span>
          <span className="tnum ml-auto shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
            <LocalTime iso={match.kickoff} kind="relative" /> · <LocalTime iso={match.kickoff} />
          </span>
        </div>

        <div className="space-y-2.5 px-4 pb-4 pt-4 sm:px-5">
          <TeamLine team={match.home} side="home" matchId={match.id} morph={morph} p={markets.home} lead={markets.home >= markets.away && markets.home >= markets.draw} />
          <TeamLine team={match.away} side="away" matchId={match.id} morph={morph} p={markets.away} lead={markets.away > markets.home && markets.away >= markets.draw} />
        </div>
      </Link>

      {/* The pick and the one action on it. Kept outside the card's link so
          the slip button is its own control, not a tap that opens the match. */}
      <div className="flex items-center gap-3 border-t border-line bg-surface-2/40 px-4 py-3 sm:px-5">
        {publishable ? (
          <>
            <Link href={matchPath(match.id)} className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                  Our pick {isStrong(topPick) && <StrongBadge />}
                </p>
                {locked.pick ? (
                  <LockedSelection group={topPick.group} className="mt-0.5 text-[15px] font-semibold text-ink" />
                ) : (
                  <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{topPick.label}</p>
                )}
              </div>
              {locked.pick ? (
                <ProTag />
              ) : (
                <p className="tnum shrink-0 text-[15px] font-bold text-brand">{percent(topPick.probability)}</p>
              )}
            </Link>
            <PickAction match={match} pick={topPick} locked={locked.pick} />
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-xs text-ink-dim">
              <span className="font-semibold text-amber">No pick</span> · not enough history yet
            </p>
            <PickAction match={match} pick={null} />
          </>
        )}
      </div>

      {/* Collapsed by default: the card answers "who and what" on its own;
          the split and goals numbers are one tap away. A native <details>
          needs no client JavaScript on a page with dozens of these. */}
      <details className="group/more border-t border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-[11px] font-medium text-ink-dim transition-colors hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
          More
          <svg viewBox="0 0 20 20" className="size-3.5 transition-transform group-open/more:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="space-y-3 px-4 pb-4 sm:px-5">
          <SplitBar home={markets.home} draw={markets.draw} away={markets.away} />
          {locked.markets ? (
            <p className="flex items-center gap-2 text-[11px] text-ink-dim">
              <ProTag /> Goals, both-teams-to-score and every other market
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Chip label="xG" value={markets.expectedGoals.total.toFixed(1)} />
              <Chip label="Over 2.5" value={percent(markets.over["2.5"])} hot={markets.over["2.5"] >= 0.6} />
              <Chip label="GG" value={percent(markets.bttsYes)} hot={markets.bttsYes >= 0.6} />
            </div>
          )}
          {publishable && sufficiency.level === "limited" && (
            <p className="text-[11px] text-amber">Thin data · treat as a guide</p>
          )}
        </div>
      </details>
    </article>
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
