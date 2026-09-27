import Link from "next/link";
import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { Badge, LiveDot, ProbabilityBar } from "@/components/ui/primitives";
import { isLive, kickoffTime, percent, relativeDay, statusLabel } from "@/lib/format";
import { Crest } from "@/components/ui/crest";
import { matchPath } from "@/lib/routes";

/** Compact fixture row used on the live and fixtures lists. */
export function MatchCard({ match, prediction }: { match: Match; prediction?: Prediction }) {
  const live = isLive(match);

  return (
    <Link
      href={matchPath(match.id)}
      className="card card-hover block min-w-0 p-4 sm:p-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {match.league.logo ? (
            <Crest src={match.league.logo} name={match.league.name} size={18} />
          ) : null}
          {/* min-w-0 on the span as well as the row: a flex item's default
              min-width is its min-content width, so without it a long
              competition name refuses to ellipsise and widens the card. */}
          <span className="min-w-0 truncate text-xs font-medium text-ink-muted">
            {match.league.name}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {live ? (
            <Badge tone="live">
              <LiveDot />
              {statusLabel(match)}
            </Badge>
          ) : (
            <span className="tnum text-xs font-medium text-ink-muted">
              {relativeDay(match.kickoff)} · {kickoffTime(match.kickoff)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        <TeamRow
          team={match.home}
          score={match.score.home}
          showScore={live || match.status === "finished"}
          winning={
            match.score.home !== null &&
            match.score.away !== null &&
            match.score.home > match.score.away
          }
        />
        <TeamRow
          team={match.away}
          score={match.score.away}
          showScore={live || match.status === "finished"}
          winning={
            match.score.home !== null &&
            match.score.away !== null &&
            match.score.away > match.score.home
          }
        />
      </div>

      {live && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-brand">
          ⚡ Live win probability inside
        </p>
      )}

      {prediction && prediction.sufficiency.publishable && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
              Model read
            </span>
            {prediction.topPick && (
              <Badge tone="brand">{prediction.topPick.label}</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(() => {
              const { home, draw, away } = prediction.markets;
              const top = Math.max(home, draw, away);
              return (
                <>
                  <Outcome label="1" value={home} isTop={home === top} />
                  <Outcome label="X" value={draw} isTop={draw === top} />
                  <Outcome label="2" value={away} isTop={away === top} />
                </>
              );
            })()}
          </div>
        </div>
      )}

      {prediction && !prediction.sufficiency.publishable && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Not enough completed matches in this competition to publish a pick.
          </p>
        </div>
      )}
    </Link>
  );
}

function TeamRow({
  team,
  score,
  showScore,
  winning,
}: {
  team: Match["home"];
  score: number | null;
  showScore: boolean;
  winning: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Crest src={team.crest} name={team.name} size={26} />
      <span className={`min-w-0 flex-1 truncate text-sm ${winning ? "font-semibold text-ink" : "text-ink"}`}>
        {team.name}
      </span>
      {showScore && (
        <span className={`tnum text-base font-bold ${winning ? "text-brand" : "text-ink"}`}>
          {score ?? 0}
        </span>
      )}
    </div>
  );
}

function Outcome({ label, value, isTop }: { label: string; value: number; isTop: boolean }) {
  return (
    <div className={`rounded-lg px-2.5 py-2 ${isTop ? "bg-brand/8" : "bg-surface-2"}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] font-semibold text-ink-dim">{label}</span>
        <span className={`tnum text-xs font-bold ${isTop ? "text-brand" : "text-ink"}`}>
          {percent(value)}
        </span>
      </div>
      <div className="mt-1.5">
        <ProbabilityBar value={value} tone={isTop ? "brand" : "neutral"} />
      </div>
    </div>
  );
}
