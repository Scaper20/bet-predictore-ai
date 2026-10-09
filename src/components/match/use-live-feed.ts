"use client";

import { useCallback, useSyncExternalStore } from "react";
import { rebase, type Reading } from "@/lib/live-clock";
import type { Match } from "@/lib/types";

/** A game in the live feed: its clock reading plus the score. */
export type LiveReading = Reading & { home: number | null; away: number | null };

/*
 * One poll of /api/live per page, shared by every row that asks for it, and
 * only while at least one does: a list with no game in play never polls. For
 * the lists that are cached server pages (fixtures, results, predictions),
 * whose snapshot of a live game can be minutes old.
 */
const POLL_MS = 30_000;
const HIDDEN_POLL_MS = 120_000;

let readings = new Map<string, LiveReading>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

async function poll() {
  try {
    const res = await fetch("/api/live", { cache: "no-store" });
    if (res.ok) {
      const data: { matches: Match[]; updatedAt?: string } = await res.json();
      // The response can sit in the CDN for a while; its own timestamp says
      // how old its minutes are.
      const at = Date.parse(data.updatedAt ?? "") || Date.now();
      const next = new Map<string, LiveReading>();
      for (const m of data.matches) {
        next.set(m.id, {
          ...rebase(readings.get(m.id), { status: m.status, minute: m.minute ?? null, observedAt: at }),
          home: m.score.home,
          away: m.score.away,
        });
      }
      readings = next;
      listeners.forEach((l) => l());
    }
  } catch {
    // Keep the last good readings; the next poll tries again.
  } finally {
    if (running) timer = setTimeout(poll, document.hidden ? HIDDEN_POLL_MS : POLL_MS);
  }
}

function onVisible() {
  if (!document.hidden && running) {
    clearTimeout(timer);
    void poll();
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!running) {
    running = true;
    document.addEventListener("visibilitychange", onVisible);
    void poll();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      running = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const noSubscribe = () => () => {};
const none = () => null;

/**
 * The live feed's latest reading for one game, or null before the first poll
 * and for games the feed doesn't carry. Pass `watch: false` for a game not in
 * play, so it never starts the poll.
 */
export function useLiveReading(matchId: string, watch: boolean): LiveReading | null {
  const get = useCallback(() => readings.get(matchId) ?? null, [matchId]);
  return useSyncExternalStore(watch ? subscribe : noSubscribe, watch ? get : none, none);
}
