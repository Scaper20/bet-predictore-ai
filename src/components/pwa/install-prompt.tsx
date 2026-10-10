"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { usePriorityPopupActive } from "@/components/ui/popup-priority";
import { INSTALLABLE_EVENT, OPEN_INSTALL_EVENT, installRoute, type InstallRoute } from "./install";

const SNOOZE_KEY = "bx_install_snoozed_until";
const SNOOZE_DAYS = 7;
/**
 * Late enough to clear the WhatsApp popup (shows at 6s, closes itself by 14s)
 * and to ask only people who stayed — someone 25 seconds in is reading, not
 * bouncing.
 */
const SHOW_DELAY_MS = 25_000;
/** Pages where an install nudge would interrupt something that matters more. */
const QUIET_PATHS = [/^\/admin/, /^\/account/, /^\/auth/, /^\/onboarding/, /^\/offline/];

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {
    // Not persisted: it can show again next visit, which is harmless.
  }
}

/**
 * "Get the app" sheet for phones.
 *
 * Shows itself once a week at most, on mobile only, never inside the
 * installed app. Also opens on demand from the menu's "Install the app" row
 * (InstallAppMenuItem), ignoring the snooze — the person asked.
 *
 * Android and other Chromium browsers get a real Install button that replays
 * the browser's own prompt; iOS gets the two Safari steps, since Apple offers
 * no prompt to replay.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const priorityActive = usePriorityPopupActive();
  const [route, setRoute] = useState<InstallRoute | null>(null);
  const [open, setOpen] = useState(false);

  // Timed, once-a-week nudge.
  useEffect(() => {
    if (priorityActive || QUIET_PATHS.some((re) => re.test(pathname))) return;
    if (!window.matchMedia("(max-width: 1023px)").matches || snoozed()) return;
    const timer = setTimeout(() => {
      const r = installRoute();
      if (r !== "prompt" && r !== "ios") return;
      setRoute(r);
      setOpen(true);
      snooze();
      track("pwa_install_shown", { route: r });
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, priorityActive]);

  // On demand, from the menu.
  useEffect(() => {
    const onOpen = () => {
      const r = installRoute();
      if (r === "prompt") {
        void runPrompt();
        return;
      }
      setRoute(r);
      setOpen(true);
    };
    // A prompt that turns up while the sheet shows iOS/manual steps upgrades it.
    const onInstallable = () => setRoute((r) => (r === null ? r : "prompt"));
    const onInstalled = () => {
      setOpen(false);
      track("pwa_installed");
    };
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    window.addEventListener(INSTALLABLE_EVENT, onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
      window.removeEventListener(INSTALLABLE_EVENT, onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function runPrompt() {
    const event = window.__bxInstallEvent;
    if (!event) return;
    setOpen(false);
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A prompt can only be used once; the browser offers a fresh one later.
    window.__bxInstallEvent = null;
    track("pwa_install_prompt", { outcome });
  }

  if (!open || !route) return null;

  const close = () => setOpen(false);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-title"
      className="fixed inset-x-3 z-[55] lg:hidden"
      style={{ bottom: "calc(var(--bottom-nav-h, 4rem) + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="card relative flex gap-3.5 p-4 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 48px static icon; next/image adds nothing here */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id="install-title" className="text-sm font-semibold text-ink">
            {route === "installed" ? "KiqStat is already on your phone" : "Get the KiqStat app"}
          </h2>

          {route === "prompt" && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              One tap from your home screen, full screen, no app store needed. Free.
            </p>
          )}

          {route === "ios" && (
            <ol className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-ink-muted">
              <li className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded bg-surface-2 text-ink">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                  </svg>
                </span>
                <span>
                  Tap <b className="text-ink">Share</b> in Safari&apos;s toolbar
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded bg-surface-2 text-ink">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <rect x="4" y="4" width="16" height="16" rx="3" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </span>
                <span>
                  Choose <b className="text-ink">Add to Home Screen</b>
                </span>
              </li>
            </ol>
          )}

          {route === "manual" && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Open your browser&apos;s menu and choose <b className="text-ink">Install app</b> or{" "}
              <b className="text-ink">Add to Home screen</b>.
            </p>
          )}

          {route === "installed" && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Open it from your home screen any time.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {route === "prompt" && (
              <button
                type="button"
                onClick={() => void runPrompt()}
                className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-xs font-semibold text-brand-ink"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-medium text-ink-muted hover:text-ink"
            >
              {route === "prompt" ? "Not now" : "Got it"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-sm text-ink-dim hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
