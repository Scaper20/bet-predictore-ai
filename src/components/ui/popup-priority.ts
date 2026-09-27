"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Coordinates the handful of full-screen timed/celebratory overlays mounted
 * together in (app)/layout.tsx (GiftPopup, WhatsAppPopup) so at most one is
 * ever visible at once — two `fixed inset-0` dialogs stacking would run two
 * useOverlay focus traps and Escape handlers simultaneously. A gift is the
 * rarer, more time-sensitive one (and its "seen" state is server-side, so
 * skipping it isn't an option the way re-showing the WhatsApp popup
 * tomorrow is) — it always wins.
 */
let active = false;
const listeners = new Set<() => void>();

function setActive(value: boolean) {
  if (active === value) return;
  active = value;
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getSnapshot = () => active;
const getServerSnapshot = () => false;

/** Call from the higher-priority popup (GiftPopup) with whether it's
 * currently showing — claims/releases the shared slot to match. */
export function useClaimsPriorityPopup(showing: boolean) {
  useEffect(() => {
    setActive(showing);
    return () => setActive(false);
  }, [showing]);
}

/** Call from a lower-priority popup (WhatsAppPopup) to know whether the
 * priority slot is currently held by something else. */
export function usePriorityPopupActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
