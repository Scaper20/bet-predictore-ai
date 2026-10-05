"use client";

/**
 * Slips the user has chosen to track, persisted to localStorage.
 *
 * Same shape as the builder's own store (lib/slip.ts): a module-level array
 * with a subscribe hook. A tracked slip is a frozen copy of the builder at
 * the moment "Track this slip" was pressed — editing the builder afterwards
 * never changes a slip that is already being followed. Finished legs have
 * their score written back here, so a settled slip is never looked up again.
 */

import { useSyncExternalStore } from "react";
import type { SlipLeg } from "@/lib/slip";
import { legTeams } from "@/lib/slip";
import { settleLeg, slipSignature, type LegResult, type LegScore, type TrackedLeg } from "@/lib/slip-tracker";

export interface TrackedSlip {
  id: string;
  createdAt: string;
  legs: TrackedLeg[];
  /** Final results by matchId, filled in as each leg finishes. */
  results: Record<string, LegResult>;
}

const KEY = "betrix.tracked-slips.v1";
/** Oldest slips fall off past this, so the list (and storage) can't grow without end. */
const MAX_SLIPS = 30;

let slips: TrackedSlip[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) slips = parsed as TrackedSlip[];
    }
  } catch {
    slips = [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(slips));
  } catch {
    // Private browsing or a full quota — tracking lasts until the tab closes.
  }
}

function update(next: TrackedSlip[]) {
  slips = next;
  persist();
  emit();
}

function subscribe(fn: () => void) {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = () => {
  hydrate();
  return slips;
};
const EMPTY: TrackedSlip[] = [];
const getServerSnapshot = () => EMPTY;

export function useTrackedSlips(): TrackedSlip[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Saves the builder's legs as a new tracked slip, or returns the existing one if it's already tracked. */
export function trackSlip(legs: SlipLeg[]): TrackedSlip | null {
  hydrate();
  if (legs.length === 0) return null;
  const signature = slipSignature(legs);
  const existing = slips.find((s) => slipSignature(s.legs) === signature);
  if (existing) return existing;

  const slip: TrackedSlip = {
    id: newId(),
    createdAt: new Date().toISOString(),
    legs: [...legs]
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
      .map((l) => {
        const teams = legTeams(l);
        return {
          matchId: l.matchId,
          fixture: l.fixture,
          homeName: teams?.homeName ?? l.fixture,
          awayName: teams?.awayName ?? "",
          league: l.league,
          kickoff: l.kickoff,
          market: l.market,
          label: l.label,
          probability: l.probability,
          fairOdds: l.fairOdds,
        };
      }),
    results: {},
  };
  update([slip, ...slips].slice(0, MAX_SLIPS));
  return slip;
}

export function untrackSlip(id: string) {
  hydrate();
  update(slips.filter((s) => s.id !== id));
}

/**
 * Writes finished legs back to every tracked slip that contains them. Takes
 * the raw scores rather than graded results: two slips can hold the same
 * match on different markets, so each leg is graded against its own.
 */
export function recordScores(scores: Record<string, LegScore>) {
  hydrate();
  let changed = false;
  const next = slips.map((s) => {
    let merged: Record<string, LegResult> | null = null;
    for (const leg of s.legs) {
      const score = scores[leg.matchId];
      if (!score || s.results[leg.matchId]) continue;
      const result = settleLeg(leg, score);
      if (!result) continue;
      merged ??= { ...s.results };
      merged[leg.matchId] = result;
    }
    if (!merged) return s;
    changed = true;
    return { ...s, results: merged };
  });
  if (changed) update(next);
}

/** True when this exact set of selections is already being tracked. */
export function isTracked(list: TrackedSlip[], legs: { matchId: string; market: string }[]): TrackedSlip | undefined {
  if (legs.length === 0) return undefined;
  const signature = slipSignature(legs);
  return list.find((s) => slipSignature(s.legs) === signature);
}
