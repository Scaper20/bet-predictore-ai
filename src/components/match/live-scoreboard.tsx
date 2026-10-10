"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Badge, LiveDot } from "@/components/ui/primitives";
import { useTickingMinute } from "@/components/match/use-live-clock";
import { rebase } from "@/lib/live-clock";
import type { LegScore } from "@/lib/slip-tracker";
import type { MatchStatus } from "@/lib/types";

interface LiveState {
  status: MatchStatus;
  minute: number | null;
  home: number | null;
  away: number | null;
  /** When the feed's minute was read (epoch ms), for the clock to count on from. */
  observedAt: number;
}

const LiveContext = createContext<LiveState | null>(null);

const isInPlay = (s: MatchStatus) => s === "live" || s === "halftime";

/**
 * Keeps the match page's scoreboard current.
 *
 * The page itself is cached and shared, and on a quiet match the copy a
 * visitor gets can be several minutes old, so the server's score and minute
 * are only where this starts. It asks /api/slip/status straight away, then
 * every 30 seconds while the game is on, and the clock counts forward between
 * answers. That endpoint is the light one: a shared, cached read of the live
 * feed, not the prediction the rest of the page is built from.
 */
export function LiveMatchProvider({
  matchId,
  initial,
  children,
}: {
  matchId: string;
  initial: LiveState;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const startsLive = isInPlay(initial.status);

  useEffect(() => {
    if (!startsLive) return;
    let cancelled = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch("/api/slip/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [matchId] }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: { matches: Record<string, LegScore> } = await res.json();
        const s = data.matches[matchId];
        if (s && !cancelled) {
          const next = { status: s.status, minute: s.minute ?? null, home: s.home, away: s.away, observedAt: Date.now() };
          setState((prev) => rebase(prev, next));
          done = !isInPlay(s.status);
        }
      } catch {
        // Keep the last good scoreboard; the clock keeps counting from it.
      } finally {
        if (!cancelled && !done) timer = setTimeout(tick, document.hidden ? 120_000 : 30_000);
      }
    };

    void tick();
    const onVisible = () => {
      if (!document.hidden && !done) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [matchId, startsLive]);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

function useLive(): LiveState {
  const s = useContext(LiveContext);
  if (!s) throw new Error("Live scoreboard parts must sit inside <LiveMatchProvider>.");
  return s;
}

export function LiveStatusBadge() {
  const s = useLive();
  const minute = useTickingMinute(s.minute, s.status, s.observedAt);
  if (s.status === "finished") return <Badge tone="neutral">Full time</Badge>;
  return (
    <Badge tone="live">
      <LiveDot />
      {s.status === "halftime" ? "HT" : minute ? `${minute}'` : "LIVE"}
    </Badge>
  );
}

export function LiveScore({ className }: { className: string }) {
  const s = useLive();
  return (
    <p className={className}>
      {s.home ?? 0}
      <span className="mx-1.5 text-ink-dim sm:mx-3">-</span>
      {s.away ?? 0}
    </p>
  );
}

/** The thin line under the score: how far through the 90 the game is. */
export function LiveProgress() {
  const s = useLive();
  const minute = useTickingMinute(s.minute, s.status, s.observedAt);
  if (s.status === "finished") return null;
  const share = s.status === "halftime" ? 0.5 : minute ? Math.min(1, minute / 90) : 0;
  return (
    <div className="mx-auto mt-2.5 w-16">
      <span className="block h-0.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </div>
  );
}
