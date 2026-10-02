"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { usePriorityPopupActive } from "@/components/ui/popup-priority";
import { NotificationControls } from "./notification-controls";
import { OPEN_INSTALL_EVENT, OPEN_NOTIFY_EVENT, isStandalone } from "./install";
import { pushState } from "./push";

const SNOOZE_KEY = "bx_notify_snoozed_until";
const SNOOZE_DAYS = 14;
/** Long enough that the app has shown what it is before it asks for anything. */
const SHOW_DELAY_MS = 20_000;
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
    // Not persisted: it can show again next launch, which is harmless.
  }
}

/**
 * "Turn on notifications?" sheet.
 *
 * Offers itself on its own only inside the installed app, where it matters
 * most (iPhone has no notifications anywhere else) and where the person has
 * already chosen to keep BetriX around. In a browser tab the install sheet
 * does the asking instead, so a visitor is never nudged twice. At most once a
 * fortnight, and only while the browser hasn't been asked yet.
 *
 * Also opens on demand from the menu's "Notifications" row, which works in
 * the browser too.
 */
export function NotificationPrompt() {
  const pathname = usePathname();
  const priorityActive = usePriorityPopupActive();
  const [open, setOpen] = useState(false);

  // Timed offer, installed app only.
  useEffect(() => {
    if (priorityActive || QUIET_PATHS.some((re) => re.test(pathname))) return;
    if (!isStandalone() || snoozed()) return;
    const timer = setTimeout(async () => {
      if ((await pushState()) !== "off" || Notification.permission !== "default") return;
      setOpen(true);
      snooze();
      track("push_prompt_shown");
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, priorityActive]);

  // On demand, from the menu. Steps aside if the install sheet opens.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onInstall = () => setOpen(false);
    window.addEventListener(OPEN_NOTIFY_EVENT, onOpen);
    window.addEventListener(OPEN_INSTALL_EVENT, onInstall);
    return () => {
      window.removeEventListener(OPEN_NOTIFY_EVENT, onOpen);
      window.removeEventListener(OPEN_INSTALL_EVENT, onInstall);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="notify-title"
      className="fixed inset-x-3 z-[55] mx-auto max-w-md"
      style={{ bottom: "calc(var(--bottom-nav-h, 4rem) + env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <div className="card relative flex gap-3.5 p-4 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 48px static icon; next/image adds nothing here */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 pr-6">
          <h2 id="notify-title" className="mb-2 text-sm font-semibold text-ink">
            Notifications
          </h2>
          <NotificationControls />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-sm text-ink-dim hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
