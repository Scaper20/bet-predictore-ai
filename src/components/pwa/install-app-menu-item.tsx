"use client";

import { useSyncExternalStore } from "react";
import { OPEN_INSTALL_EVENT, isStandalone } from "./install";

const noop = () => () => {};

/**
 * "Install the app" row for the mobile menu. Hidden inside the installed app;
 * everywhere else it opens InstallPrompt, which knows what this browser can do.
 */
export function InstallAppMenuItem({ onSelect }: { onSelect?: () => void }) {
  // Server and first paint render the row; the installed app hides it.
  const standalone = useSyncExternalStore(noop, isStandalone, () => false);
  if (standalone) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a 20px static icon */}
      <img src="/icons/icon-192.png" alt="" width={20} height={20} className="size-5 rounded" />
      Install the app
    </button>
  );
}
