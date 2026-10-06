"use client";

import { useEffect, useMemo, useState } from "react";
import type { LegScore } from "@/lib/slip-tracker";

const POLL_MS = 30_000;
const TICK_MS = 60_000;
/** Stop asking about a game this long after kickoff; it is over by then. */
const WATCH_MS = 3 * 60 * 60 * 1000;

/**
 * Live status and score for the For You picks that have kicked off.
 *
 * Asks only about games between kickoff and three hours after, so a page
 * of picks for later today costs nothing until the first one starts. Uses
 * /api/slip/status, the same lookup the tracked slips use. Paused while the
 * tab is hidden.
 */
export function useLivePicks(picks: { id: string; kickoff: string; status: string }[]): Record<string, LegScore> {
  const [scores, setScores] = useState<Record<string, LegScore>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const key = useMemo(() => {
    const ids = picks
      .filter((p) => {
        if (scores[p.id]?.status === "finished") return false;
        const k = Date.parse(p.kickoff);
        return now >= k && now - k < WATCH_MS;
      })
      .map((p) => p.id);
    return [...new Set(ids)].sort().join(",");
  }, [picks, scores, now]);

  useEffect(() => {
    if (key === "") return;
    const ids = key.split(",");
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/slip/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { matches?: Record<string, LegScore> };
        if (!cancelled) setScores((prev) => ({ ...prev, ...(body.matches ?? {}) }));
      } catch {
        // Offline; the next tick tries again.
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
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  return scores;
}
