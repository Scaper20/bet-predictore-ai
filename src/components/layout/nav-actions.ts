"use client";

import { openAsk } from "@/lib/ask-store";
import { OPEN_INSTALL_EVENT, OPEN_NOTIFY_EVENT } from "@/lib/pwa";
import type { NavAction } from "@/lib/nav";

/** What a nav item with an `action` does instead of navigating. */
export function runNavAction(action: NavAction) {
  if (action === "ask") openAsk();
  else if (action === "install") window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
}

export function openNotifications() {
  window.dispatchEvent(new Event(OPEN_NOTIFY_EVENT));
}
