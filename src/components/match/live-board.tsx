"use client";

import { useEffect, useState } from "react";
import type { Match } from "@/lib/types";
import { MatchCard } from "@/components/match/match-card";
import { Badge, EmptyState, ButtonLink, LiveDot } from "@/components/ui/primitives";

/**
 * Live score board.
 *
 * Polls rather than opening a socket: the upstream feeds are themselves
 * polled, so a socket would add moving parts without adding freshness. The
 * interval backs off while the tab is hidden so a forgotten tab does not burn
 * through the free-tier request budget.
 */
export function LiveBoard({ initial }: { initial: Match[] }) {
  const [matches, setMatches] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failing, setFailing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: { matches: Match[] } = await res.json();
        if (!cancelled) {
          setMatches(data.matches);
          setUpdatedAt(new Date());
          setFailing(false);
        }
      } catch {
        // Keep showing the last good board; a blip should not blank the page.
        if (!cancelled) setFailing(true);
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, document.hidden ? 120_000 : 30_000);
        }
      }
    };

    timer = setTimeout(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) {
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
  }, []);

  if (matches.length === 0) {
    return (
      <EmptyState
        icon="⏱"
        title="No matches in play right now"
        description="Nothing is kicking about at the moment. This board only ever shows genuinely live fixtures, so it stays empty rather than filling the space."
        action={<ButtonLink href="/fixtures" variant="secondary">See upcoming fixtures</ButtonLink>}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Badge tone="live">
          <LiveDot />
          {matches.length} live
        </Badge>
        <span className="text-xs text-ink-dim">
          {failing
            ? "Reconnecting to the feed — showing the last good scores"
            : updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString("en-NG", { hour12: false })}`
              : "Auto-refreshing every 30 seconds"}
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}
