"use client";

/**
 * Ask KiqStat's client state that lives outside the panel: whether it's open,
 * what page the user is on (set by <AskPageContext> on match pages), and a
 * question queued by a button elsewhere ("Ask about this match").
 *
 * Same module-store-plus-hook shape as lib/slip.ts.
 */

import { useSyncExternalStore } from "react";

export interface AskPage {
  matchId: string;
  label: string;
}

interface AskState {
  open: boolean;
  page: AskPage | null;
  /** A question to send (or just prefill) the next time the panel reads the queue. */
  queued: { text: string; send: boolean } | null;
}

let state: AskState = { open: false, page: null, queued: null };
const listeners = new Set<() => void>();

function set(next: Partial<AskState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SERVER: AskState = { open: false, page: null, queued: null };

export function useAskState(): AskState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function openAsk(question?: { text: string; send?: boolean }) {
  set({ open: true, queued: question ? { text: question.text, send: question.send ?? false } : state.queued });
}

export function closeAsk() {
  set({ open: false });
}

export function toggleAsk() {
  set({ open: !state.open });
}

export function takeQueued(): AskState["queued"] {
  const q = state.queued;
  if (q) set({ queued: null });
  return q;
}

export function setAskPage(page: AskPage | null) {
  if (state.page?.matchId === page?.matchId && state.page?.label === page?.label) return;
  set({ page });
}
