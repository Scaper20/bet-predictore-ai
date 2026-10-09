"use client";

import { useState, useSyncExternalStore } from "react";
import { steadyMinute, tickedMinute } from "@/lib/live-clock";
import type { MatchStatus } from "@/lib/types";

/*
 * One shared timer for every live clock on the page, however many there
 * are. Every five seconds, so a clock showing whole minutes rolls over within
 * five seconds of the real one.
 */
const STEP_MS = 5_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onTick: () => void) {
  listeners.add(onTick);
  timer ??= setInterval(() => listeners.forEach((l) => l()), STEP_MS);
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

// Rounded to the step, so repeated reads within one step return the same
// value, as useSyncExternalStore requires.
const now = () => Math.floor(Date.now() / STEP_MS) * STEP_MS;
// The server and the hydrating client both say "no time has passed", so the
// first client render matches the HTML; the projected minute follows at once.
const serverNow = () => 0;

/**
 * The live minute now, counted forward from `observedAt` (epoch ms), when the
 * feed reported `minute`, and never stepping back a minute or two when a
 * fresh reading arrives (see lib/live-clock.ts for both rules).
 */
export function useTickingMinute(
  minute: number | null | undefined,
  status: MatchStatus,
  observedAt: number,
): number | null {
  const t = useSyncExternalStore(subscribe, now, serverNow);
  const projected = t === 0 ? (minute ?? null) : tickedMinute(minute, status, observedAt, t);

  // What this clock last showed, kept only while the status holds: halftime
  // or full time starts it afresh. Updated during render, the React pattern
  // for state that follows props, so the held value never flashes.
  const [last, setLast] = useState<{ status: MatchStatus; shown: number | null }>({ status, shown: projected });
  const shown = last.status === status ? steadyMinute(last.shown, projected) : projected;
  if (last.status !== status || last.shown !== shown) setLast({ status, shown });
  return shown;
}
