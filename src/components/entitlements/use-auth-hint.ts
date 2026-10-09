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
 * useSyncExternalStore reads it hydration-safely (the server snapshot is
 * deliberately null so the markup matches) and re-reads it when the session
 * changes: EntitlementProvider fires AUTH_HINT_EVENT when it sees the cookie
 * flip after a sign-in or sign-out, so the header doesn't keep the old shape.
 */
export const AUTH_HINT_EVENT = "bx-auth-change";

function subscribe(onChange: () => void) {
  window.addEventListener(AUTH_HINT_EVENT, onChange);
  return () => window.removeEventListener(AUTH_HINT_EVENT, onChange);
}

/** The raw cookie value, "1" or "0", or null when it isn't set. */
export function readAuthHintCookie(): string | null {
  if (typeof document === "undefined") return null;
  return document.cookie.match(/(?:^|; )bx_auth=([01])/)?.[1] ?? null;
}

function readHint(): boolean | null {
  const v = readAuthHintCookie();
  return v === null ? null : v === "1";
}

/** True/false once known, null when there is no hint to go on. */
export function useAuthHint(): boolean | null {
  return useSyncExternalStore(subscribe, readHint, () => null);
}
