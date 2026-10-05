"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 90_000;

/**
 * How many games are in play, for the Live tab's badge. Reads /api/live,
 * which is shared-cached for 20 seconds, so every open tab costs the feeds
 * nothing extra. Paused while the tab is hidden.
 */
export function useLiveCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/live")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { matches?: unknown[] } | null) => {
          if (!cancelled && d && Array.isArray(d.matches)) setCount(d.matches.length);
        })
        .catch(() => {});
    };
    const first = window.setTimeout(load, 1200); // after the page's own work
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}
