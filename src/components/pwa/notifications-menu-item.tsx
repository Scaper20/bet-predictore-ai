"use client";

import { OPEN_NOTIFY_EVENT } from "./install";

/** "Notifications" row for the mobile menu; opens NotificationPrompt. */
export function NotificationsMenuItem({ onSelect }: { onSelect?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.();
        window.dispatchEvent(new Event(OPEN_NOTIFY_EVENT));
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      Notifications
    </button>
  );
}
