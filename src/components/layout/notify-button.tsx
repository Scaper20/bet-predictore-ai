"use client";

import { openNotifications } from "@/components/layout/nav-actions";

export function NotifyButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openNotifications} className={className}>
      Turn on notifications
    </button>
  );
}
