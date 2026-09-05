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
  /**
   * The two clubs, kept apart rather than only as the "A v B" display string.
   *
   * A bookmaker is matched to a fixture by club and kickoff, and splitting the
   * display string back apart is guesswork the moment a club's name contains
   * the separator. Optional because slips saved before this existed are still
   * in people's browsers; legTeams() handles those.
   */
  homeName?: string;
  awayName?: string;
  /**
   * Where bookmakerOdds came from.
   *
   * The distinction matters for what the UI may claim. A price the user typed
   * is theirs and is never overwritten; a price fetched from SportyBet is
   * attributed to SportyBet and refreshes. Without this the slip cannot honour
   * an edit without also forgetting where the original number came from.
   */
  oddsSource?: "user" | "sportybet";
}

/**
 * The two clubs on a leg, however old the leg is.
 *
 * Legs saved before homeName/awayName existed carry only "Home v Away", so
 * this falls back to splitting on the separator the slip itself writes. The
 * split is last-resort and not a parser: a club whose name contains " v "
 * yields the wrong teams, which findFixture on the server then refuses rather
 * than mis-prices.
 */
export function legTeams(leg: SlipLeg): { homeName: string; awayName: string } | null {
  if (leg.homeName && leg.awayName) {
    return { homeName: leg.homeName, awayName: leg.awayName };
  }
  const parts = leg.fixture.split(" v ");
  if (parts.length !== 2) return null;
  const [homeName, awayName] = parts.map((p) => p.trim());
  return homeName && awayName ? { homeName, awayName } : null;
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
    legs = legs.map((l) =>
      l.matchId === matchId
        ? { ...l, bookmakerOdds: value, oddsSource: value === undefined ? undefined : "user" }
        : l,
    );
    persist();
    emit();
  }, []);

  /**
   * Fill in prices fetched from a bookmaker.
   *
   * Deliberately never overwrites a price the user typed. Someone who has
   * entered the number from their own betslip has told us what they are
   * actually being offered, and replacing it with a board price -- which can
   * differ by a tick, or be a stale cache entry -- would silently change the
   * bet they are evaluating.
   */
  const applyFetchedOdds = useCallback((prices: Map<string, number>) => {
    let changed = false;
    legs = legs.map((l) => {
      if (l.oddsSource === "user") return l;
      const price = prices.get(l.matchId);
      if (price === undefined || price === l.bookmakerOdds) return l;
      changed = true;
      return { ...l, bookmakerOdds: price, oddsSource: "sportybet" as const };
    });
    if (!changed) return;
    persist();
    emit();
  }, []);

  const clear = useCallback(() => {
    clearSlip();
  }, []);

  return { legs: value, add, remove, clear, setBookmakerOdds, applyFetchedOdds };
}
