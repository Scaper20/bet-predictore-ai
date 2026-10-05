"use client";

import { useEffect, useMemo, useState } from "react";
import { legsToPoll, type LegScore } from "@/lib/slip-tracker";
import { recordScores, type TrackedSlip } from "@/lib/tracked-slips";

/** About as often as the live board itself refreshes (/api/live is cached for 20s). */
const POLL_MS = 30_000;
/** How often to look again for legs that have just kicked off. */
const TICK_MS = 60_000;

/**
 * Live scores for every leg on the given slips that has kicked off and isn't
 * settled yet. Finished legs are written back to the tracked-slips store,
 * which takes them off the list to poll — so a slip that's over costs
 * nothing, and an all-pending slip costs nothing until its first kickoff.
 *
 * Paused while the tab is hidden; catches up as soon as it's visible again.
 */
export function useSlipScores(slips: TrackedSlip[]): Record<string, LegScore> {
  const [scores, setScores] = useState<Record<string, LegScore>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const s of slips) for (const l of legsToPoll(s.legs, s.results, now)) set.add(l.matchId);
    return [...set].sort();
  }, [slips, now]);
  const key = ids.join(",");

  useEffect(() => {
    if (key === "") return;
    const wanted = key.split(",");
    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch("/api/slip/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: wanted }),
          signal: controller.signal,
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { matches?: Record<string, LegScore> };
        const matches = body.matches ?? {};
        if (cancelled) return;
        setScores((prev) => ({ ...prev, ...matches }));
        recordScores(matches);
      } catch {
        // Offline or aborted — the next tick tries again.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  return scores;
}
