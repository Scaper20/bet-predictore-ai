import Link from "next/link";
import type { Match } from "@/lib/types";
import { Crest } from "@/components/ui/crest";
import { LiveDot } from "@/components/ui/primitives";
import { Morph, morphName } from "@/components/motion/morph";
import { kickoffTime } from "@/lib/format";
import { matchPath } from "@/lib/routes";

/**
 * One fixture or result as a scoreboard row, the Live board's layout: the
 * clock (or kick-off time) on the left, the two clubs stacked, the score on
 * the right. Shared by Fixtures and Results so the three lists read alike.
 *
 * Crests carry a view-transition name, so tapping a row grows them into the
 * match page's header. Each match appears once per list, which the names
 * need.
 */
export function FixtureRow({
  match,
  note,
  footer,
  index = 0,
}: {
  match: Match;
  /** Small right-hand annotation for a game with no score yet (e.g. a pick). */
  note?: React.ReactNode;
  /** A line under the two clubs (the results page puts our pick there). */
  footer?: React.ReactNode;
  index?: number;
}) {
  const live = match.status === "live" || match.status === "halftime";
  const finished = match.status === "finished";
  const { home, away } = match.score;
  const scored = (live || finished) && home !== null && away !== null;
  const leader = scored && home !== away ? (home! > away! ? "home" : "away") : null;

  return (
    <Link
      href={matchPath(match.id)}
      style={{ ["--i" as string]: index }}
      className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5"
    >
      <Clock match={match} />
      <div className="min-w-0 space-y-1.5">
        <TeamLine team={match.home} matchId={match.id} side="home" strong={leader === "home"} dim={leader === "away"} />
        <TeamLine team={match.away} matchId={match.id} side="away" strong={leader === "away"} dim={leader === "home"} />
        {footer}
      </div>
      <div className="flex items-center gap-2.5">
        {scored ? (
          <div className="space-y-1.5 text-right">
            <Score value={home} strong={leader === "home"} live={live} />
            <Score value={away} strong={leader === "away"} live={live} />
          </div>
        ) : (
          note ?? null
        )}
        <svg
          viewBox="0 0 20 20"
          className="hidden size-4 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function Clock({ match }: { match: Match }) {
  if (match.status === "halftime") {
    return (
      <span className="w-fit rounded-md border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber">HT</span>
    );
  }
  if (match.status === "live") {
    return (
      <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-rose">
        <LiveDot />
        <span className="tnum">{match.minute ? `${match.minute}′` : "Live"}</span>
      </span>
    );
  }
  if (match.status === "finished") return <span className="font-mono text-[11px] font-bold text-ink-dim">FT</span>;
  if (match.status === "postponed") return <span className="font-mono text-[11px] font-bold text-amber">PST</span>;
  if (match.status === "cancelled") return <span className="font-mono text-[11px] font-bold text-rose">CAN</span>;
  return <span className="tnum font-mono text-[13px] font-semibold text-ink">{kickoffTime(match.kickoff)}</span>;
}

function TeamLine({
  team,
  matchId,
  side,
  strong,
  dim,
}: {
  team: Match["home"];
  matchId: string;
  side: "home" | "away";
  strong: boolean;
  dim: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Morph name={morphName(matchId, side)}>
        <span className="inline-flex shrink-0">
          <Crest src={team.crest} name={team.name} size={20} />
        </span>
      </Morph>
      <span className={`min-w-0 truncate text-sm ${strong ? "font-semibold text-ink" : dim ? "text-ink-muted" : "text-ink"}`}>
        {team.name}
      </span>
    </div>
  );
}

function Score({ value, strong, live }: { value: number | null; strong: boolean; live: boolean }) {
  return (
    <span className={`tnum block text-base font-bold leading-5 ${strong ? (live ? "text-brand" : "text-ink") : live ? "text-ink" : "text-ink-muted"}`}>
      {value ?? 0}
    </span>
  );
}
