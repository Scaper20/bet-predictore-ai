"use client";

import { useSyncExternalStore } from "react";

/**
 * "Was there a session on the last request?", read from the bx_auth cookie
 * that proxy.ts maintains.
 *
 * This exists to fill one specific gap. The header cannot resolve auth on the
 * server — that would mean cookies() in the shared layout, which costs every
 * route below it its static rendering — so it waits on a fetch to
 * /api/entitlements, and an anonymous visitor gets the sign-up CTA a round
 * trip late. Reading a cookie is synchronous, so the header can paint the
 * right shape at hydration and let the fetch confirm it.
 *
 * NEVER authorize on this. It is client-readable, trivially forgeable, and
 * says nothing about tier. Every real check is getEntitlement() server-side.
 *
 * The subscribe/snapshot pair is the same trick theme-toggle.tsx uses: nothing
 * mutates the cookie while this is mounted, so there is nothing to subscribe
 * to — useSyncExternalStore is here purely to read it hydration-safely, with
 * the server snapshot deliberately null so the markup matches.
 */
function subscribe() {
  return () => {};
}

function readHint(): boolean | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )bx_auth=([01])/);
  if (!match) return null;
  return match[1] === "1";
}

/** True/false once known, null when there is no hint to go on. */
export function useAuthHint(): boolean | null {
  return useSyncExternalStore(subscribe, readHint, () => null);
}
