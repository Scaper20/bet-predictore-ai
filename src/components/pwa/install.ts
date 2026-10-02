"use client";

/**
 * Shared install-to-home-screen plumbing.
 *
 * Two platforms, two mechanisms:
 *  - Chromium (Android Chrome, Samsung Internet, Edge) fires
 *    `beforeinstallprompt`, which we hold on to and replay from our own
 *    button. It fires once, early — often before any deferred widget has
 *    mounted — so a tiny inline script in the root layout (INSTALL_CAPTURE_SCRIPT)
 *    catches it into window.__bxInstallEvent (lib/pwa.ts).
 *  - iOS has no prompt API at all. The only route is Share → Add to Home
 *    Screen, so on iOS we show those two steps instead.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export { INSTALLABLE_EVENT, OPEN_INSTALL_EVENT } from "@/lib/pwa";

declare global {
  interface Window {
    __bxInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallRoute = "prompt" | "ios" | "manual" | "installed";

/** How this browser can install the app right now. */
export function installRoute(): InstallRoute {
  if (isStandalone()) return "installed";
  if (window.__bxInstallEvent) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}
