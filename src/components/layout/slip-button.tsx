"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTrackedSlips } from "@/lib/tracked-slips";
import { slipSettled } from "@/lib/slip-tracker";
import { useSlipScores } from "@/components/slip/use-slip-scores";
import { sportPath } from "@/lib/routes";
import type { SportId } from "@/lib/sports";

/** Tracked slips still running: not yet lost, and not every leg in. */
function useOpenSlips() {
  const slips = useTrackedSlips();
  return useMemo(() => slips.filter((s) => !slipSettled(s.legs, s.results)), [slips]);
}

/**
 * My slips (the tracked slips page), with a count of the tracked slips still
 * running. Tracking a slip adds one; it comes off when the slip is decided (a
 * leg loses, or every game is over) or is removed. The slip being built has
 * its own count on the floating button (components/slip/slip-sheet.tsx).
 *
 * The tracked slips live in localStorage, so the badge renders nothing on the
 * server and appears after hydration — conditional on a non-zero count, so it
 * reads as an arrival rather than a flicker.
 */
export function SlipButton({ sport }: { sport: SportId }) {
  const count = useOpenSlips().length;

  return (
    <Link
      href={sportPath("trackedSlips", sport)}
      className="relative grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={count > 0 ? `My slips (${count} being tracked)` : "My slips"}
      title="My slips"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14l-3-2-2 2-2-2-2 2-2-2-3 2V5Z" />
        <path strokeLinecap="round" d="M8.5 9.5h7M8.5 13h4" />
      </svg>
      {count > 0 && (
        <span
          className="tnum absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink"
          aria-hidden
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** Every two minutes is plenty to notice a game has ended; the slips page polls faster. */
const WATCH_MS = 120_000;

/**
 * Keeps the count honest away from the slips page: checks the scores of open
 * slips' legs that have kicked off and records finished ones, which takes the
 * slip off the count once it's decided. Mounted once in the header (the two
 * SlipButtons are the desktop and phone layouts of the same thing). Costs
 * nothing while no tracked leg is in play.
 */
export function TrackedSlipsWatcher() {
  useSlipScores(useOpenSlips(), WATCH_MS);
  return null;
}
