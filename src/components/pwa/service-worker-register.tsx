"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { syncPush } from "./push";

/**
 * Registers public/sw.js once the page has finished loading, so it never
 * competes with first paint. Production only: in dev a service worker would
 * cache hot-reloaded chunks and serve yesterday's code.
 *
 * Once registered, re-sends this device's push subscription (once a session)
 * so the server's copy stays current.
 *
 * Also records how the app is being used — installed (standalone) or in a
 * browser tab — once per session, so the admin can see whether installs
 * actually turn into launches.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        // Keeps this device's notification subscription current; see push.ts.
        .then(() => syncPush())
        .catch(() => {
          // Not fatal: the site works exactly the same without it.
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (standalone && !sessionStorage.getItem("bx_pwa_launch")) {
        sessionStorage.setItem("bx_pwa_launch", "1");
        track("pwa_launch");
      }
    } catch {
      // Storage can be blocked; analytics is optional.
    }

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
