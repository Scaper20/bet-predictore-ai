"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { COUNTRY_COOKIE } from "@/lib/visitor";
import { needsConsent } from "@/lib/mixpanel/events";
import { bumpSessionNumber, identifyUser, initMixpanel, resetIdentity, setReplayPaused, syncAnonId } from "@/lib/mixpanel/client";

/** Screens where nothing is recorded: sign-in and sign-up, password reset, billing and onboarding. */
const NO_REPLAY = ["/account/login", "/account/sign-up", "/account/forgot-password", "/account/reset-password", "/account/billing", "/onboarding", "/admin"];
const isNoReplay = (path: string) => NO_REPLAY.some((p) => path === p || path.startsWith(`${p}/`));

function visitorCountry(): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COUNTRY_COOKIE}=([A-Z]{2})`));
  return m?.[1];
}

/**
 * Starts Mixpanel on app boot (after the page is idle, so it costs first paint
 * nothing) and keeps the identity right:
 *
 *  - signed in: identify() with the database user id, on every load, then the
 *    tier goes on their profile;
 *  - signed out after being signed in: reset(), so the next person on this
 *    browser doesn't inherit the history.
 *
 * Renders nothing. Mounted once, under EntitlementProvider in the (app) layout.
 */
export function MixpanelProvider() {
  const { entitlement, loading } = useEntitlement();
  const started = useRef(false);
  const wasSignedIn = useRef(false);
  const country = useRef<string | undefined>(undefined);
  const pathname = usePathname();
  const paused = useRef(false);

  // Boot: once per page load.
  useEffect(() => {
    country.current = visitorCountry();
    // A visitor from a region that needs a consent prompt is not tracked until the app has one.
    if (needsConsent(country.current)) return;
    const boot = () => {
      if (started.current) return;
      started.current = true;
      bumpSessionNumber();
      void initMixpanel().then(() => syncAnonId());
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(boot, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = globalThis.setTimeout(boot, 1500);
    return () => globalThis.clearTimeout(t);
  }, []);

  // Replay is paused on sensitive screens and resumed when the visitor leaves them.
  useEffect(() => {
    if (needsConsent(country.current)) return;
    const sensitive = isNoReplay(pathname ?? "");
    if (sensitive === paused.current) return;
    paused.current = sensitive;
    setReplayPaused(sensitive);
  }, [pathname]);

  // Identity: whenever the account state is known or changes.
  useEffect(() => {
    if (loading || needsConsent(country.current)) return;
    if (entitlement.signedIn && entitlement.userId) {
      wasSignedIn.current = true;
      void initMixpanel().then(() => identifyUser(entitlement.userId!, { tier: entitlement.tier, country: country.current }));
    } else if (wasSignedIn.current) {
      wasSignedIn.current = false;
      resetIdentity();
    }
  }, [loading, entitlement.signedIn, entitlement.userId, entitlement.tier]);

  return null;
}
