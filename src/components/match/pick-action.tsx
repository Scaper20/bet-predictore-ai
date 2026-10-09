"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import type { Match } from "@/lib/types";
import type { Pick as ModelPick } from "@/lib/model/predict";
import type { LegScore } from "@/lib/slip-tracker";
import { useSlip } from "@/lib/slip";
import { useLivePicks } from "@/components/for-you/use-live-picks";
import { isStaleInPlay } from "@/lib/match-status";
import { LiveDot } from "@/components/ui/primitives";
import { useTickingMinute } from "@/components/match/use-live-clock";

/**
 * The one thing a pick card lets you do without opening the match: put the
 * pick on the slip. Once the game kicks off there is nothing to add, so the
 * same spot shows the live score instead (and the final score after).
 */

const LiveScores = createContext<Record<string, LegScore>>({});

/** One poll for every card on the page, rather than one per card. */
export function LiveScoresProvider({
  matches,
  children,
}: {
  matches: { id: string; kickoff: string; status: string }[];
  children: React.ReactNode;
}) {
  const scores = useLivePicks(matches);
  return <LiveScores.Provider value={scores}>{children}</LiveScores.Provider>;
}

type CardMatch = Pick<Match, "id" | "kickoff" | "status" | "minute" | "score"> & {
  home: { name: string };
  away: { name: string };
  league: { name: string };
};

export function PickAction({
  match,
  pick,
  locked = false,
  className = "",
}: {
  match: CardMatch;
  pick: ModelPick | null;
  locked?: boolean;
  className?: string;
}) {
  const live = useContext(LiveScores)[match.id];
  const { legs, add, remove } = useSlip();

  // Fresh poll first, then what the page was rendered with.
  const state: LegScore = live ?? {
    status: match.status,
    minute: match.minute ?? null,
    home: match.score.home,
    away: match.score.away,
  };
  // A feed stuck on "live" long after kickoff reads as full time (match-status.ts).
  const stale = isStaleInPlay(state.status as Match["status"], match.kickoff);
  const inPlay = !stale && (state.status === "live" || state.status === "halftime");
  const over = state.status === "finished" || stale;
  // Counts on between polls; the server-rendered minute isn't stamped, so it waits for the first.
  const minute = useTickingMinute(state.minute, state.status as Match["status"], live?.observedAt ?? Number.NaN);

  if (inPlay || over) {
    const hasScore = state.home !== null && state.away !== null;
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
          inPlay ? "bg-rose/12 text-rose" : "bg-surface-3 text-ink-muted"
        } ${className}`}
      >
        {inPlay && <LiveDot />}
        <span>{inPlay ? (state.status === "halftime" ? "HT" : minute ? `${minute}'` : "LIVE") : "FT"}</span>
        {hasScore && <span className="tnum text-ink">{state.home} – {state.away}</span>}
      </span>
    );
  }

  if (!pick) return null;

  if (locked) {
    return (
      <Link
        href="/account/billing?plan=pro"
        className={`shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink ${className}`}
      >
        Unlock
      </Link>
    );
  }

  const onSlip = legs.some((l) => l.matchId === match.id && l.market === pick.market);
  return (
    <button
      type="button"
      aria-pressed={onSlip}
      aria-label={onSlip ? `Remove ${pick.label} from slip` : `Add ${pick.label} to slip`}
      onClick={() =>
        onSlip
          ? remove(match.id)
          : add({
              matchId: match.id,
              fixture: `${match.home.name} v ${match.away.name}`,
              homeName: match.home.name,
              awayName: match.away.name,
              league: match.league.name,
              kickoff: match.kickoff,
              market: pick.market,
              label: pick.label,
              probability: pick.probability,
              fairOdds: pick.fairOdds,
            })
      }
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
        onSlip ? "border border-brand/40 bg-brand/10 text-brand" : "bg-brand text-brand-ink hover:bg-brand-strong"
      } ${className}`}
    >
      {onSlip ? "✓ On slip" : "+ Slip"}
    </button>
  );
}
