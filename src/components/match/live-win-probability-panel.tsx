"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, LiveDot, ProbabilityBar } from "@/components/ui/primitives";
import { percent } from "@/lib/format";
import { useTickingMinute } from "@/components/match/use-live-clock";
import { rebase, type Reading } from "@/lib/live-clock";

interface LiveProbabilityPayload {
  home: number;
  draw: number;
  away: number;
  currentScore: { home: number; away: number };
  elapsedMinutes: number;
  publishable: boolean;
}

/**
 * Polls the VIP-gated live-probability endpoint while the match is live.
 * Rendered inside <Gate requires="vip"> on the match page — that only
 * decides whether to *attempt* this (fast, client-side, no network round
 * trip); the actual entitlement check that matters happens server-side on
 * every poll, in api/match/[id]/live-probability/route.ts.
 */
export function LiveWinProbabilityPanel({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LiveProbabilityPayload | null>(null);
  // When `data` arrived, so its minute can count on until the next poll.
  const [observedAt, setObservedAt] = useState(0);
  const [failing, setFailing] = useState(false);
  const [ended, setEnded] = useState(false);
  // A ref, not state: the recursive setTimeout below reads this from inside
  // a closure created once per matchId, so a state variable here would be
  // permanently stale (its value frozen at whatever it was when the closure
  // was created) and would never actually stop the polling loop.
  const endedRef = useRef(false);

  useEffect(() => {
    endedRef.current = false;
    let cancelled = false;
    let last: Reading | null = null;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(matchId)}/live-probability`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (!cancelled) {
            endedRef.current = true;
            setEnded(true);
          }
          return; // match is no longer live — stop polling, no next timer.
        }
        if (!res.ok) throw new Error(String(res.status));
        const json: LiveProbabilityPayload = await res.json();
        if (!cancelled) {
          last = rebase(last, { status: "live", minute: json.elapsedMinutes, observedAt: Date.now() });
          setData(json);
          setObservedAt(last.observedAt);
          setFailing(false);
        }
      } catch {
        // Keep showing the last good read; a blip should not blank the panel.
        if (!cancelled) setFailing(true);
      } finally {
        if (!cancelled && !endedRef.current) {
          timer = setTimeout(tick, document.hidden ? 120_000 : 25_000);
        }
      }
    };

    void tick(); // fetch immediately — there's no server-passed initial value to show first.
    const onVisible = () => {
      if (!document.hidden && !endedRef.current) {
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
  }, [matchId]);

  // Above the early returns, as a hook must be. The payload has no status, but a
  // halftime minute is 45 and the clock never runs past the end of a half.
  const minute = useTickingMinute(data?.elapsedMinutes, "live", observedAt);

  if (ended && !data) return null;
  if (!data) {
    return (
      <div className="card p-5">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Loading live win probability…
        </p>
        <div className="animate-pulse space-y-3">
          <div className="h-4 rounded bg-surface-2" />
          <div className="h-4 rounded bg-surface-2" />
          <div className="h-4 rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  const best = Math.max(data.home, data.draw, data.away);
  const rows = [
    { label: "Home", value: data.home },
    { label: "Draw", value: data.draw },
    { label: "Away", value: data.away },
  ];

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Live win probability
        </span>
        {ended ? (
          <Badge tone="neutral">Full time</Badge>
        ) : (
          <Badge tone="live">
            <LiveDot />
            {minute ?? data.elapsedMinutes}&apos;
          </Badge>
        )}
      </div>

      <p className="tnum mb-4 text-center text-2xl font-bold">
        {data.currentScore.home}–{data.currentScore.away}
      </p>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className={`text-sm ${r.value === best ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {r.label}
              </span>
              <span className="tnum text-sm font-bold">{percent(r.value, 1)}</span>
            </div>
            <ProbabilityBar value={r.value} tone={r.value === best ? "brand" : "neutral"} />
          </div>
        ))}
      </div>

      {!data.publishable && (
        <p className="mt-4 text-[11px] leading-relaxed text-amber">
          Thin sample for this competition — treat as indicative.
        </p>
      )}
      {failing && (
        <p className="mt-4 text-[11px] leading-relaxed text-ink-dim">
          Reconnecting to the feed — showing the last good read.
        </p>
      )}
    </div>
  );
}
