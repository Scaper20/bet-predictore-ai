"use client";

/**
 * Bet slip, persisted to localStorage.
 *
 * Deliberately not a state library: the slip is a small array that two
 * components need to agree on, so a module-level store with a subscribe hook
 * is the whole requirement.
 */

import { useCallback, useSyncExternalStore } from "react";

export interface SlipLeg {
  matchId: string;
  fixture: string;
  league: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  /** The model's fair price; users can override with a real bookmaker price. */
  fairOdds: number;
  bookmakerOdds?: number;
}

const KEY = "betrix.slip.v1";
/** Pre-rebrand key — read once as a fallback so existing users don't lose a live slip. */
const LEGACY_KEY = "naijaodds.slip.v1";

let legs: SlipLeg[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) legs = parsed as SlipLeg[];
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Corrupted or unavailable storage should never break the page.
    legs = [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(legs));
  } catch {
    // Private browsing or a full quota — the slip simply will not survive a reload.
  }
}

function subscribe(fn: () => void) {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = () => {
  hydrate();
  return legs;
};

/** The server has no slip, and an empty array keeps the markup stable. */
const EMPTY: SlipLeg[] = [];
const getServerSnapshot = () => EMPTY;

export function clearSlip() {
  legs = [];
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    }
  } catch {}
  persist();
  emit();
}

export function useSlip() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((leg: SlipLeg) => {
    // One selection per match: a slip with two outcomes of the same fixture is
    // not a parlay, it is a mistake.
    legs = [...legs.filter((l) => l.matchId !== leg.matchId), leg];
    persist();
    emit();
  }, []);

  const remove = useCallback((matchId: string) => {
    legs = legs.filter((l) => l.matchId !== matchId);
    persist();
    emit();
  }, []);

  const setBookmakerOdds = useCallback((matchId: string, value: number | undefined) => {
    legs = legs.map((l) => (l.matchId === matchId ? { ...l, bookmakerOdds: value } : l));
    persist();
    emit();
  }, []);

  const clear = useCallback(() => {
    clearSlip();
  }, []);

  return { legs: value, add, remove, clear, setBookmakerOdds };
}
