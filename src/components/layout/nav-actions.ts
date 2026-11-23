"use client";

import { openAsk } from "@/lib/ask-store";
import { OPEN_INSTALL_EVENT, OPEN_NOTIFY_EVENT } from "@/lib/pwa";
import type { NavAction } from "@/lib/nav";
import { openTour } from "@/lib/tour";

/** Opens the slip overlay (components/slip/slip-sheet.tsx). */
export const OPEN_SLIP_EVENT = "bx-open-slip";
/** Opens the support chat (components/support/chat-widget.tsx). */
export const OPEN_SUPPORT_EVENT = "bx-open-support";

/** Opens the ⌘K command menu (components/layout/command-palette.tsx). */
export const OPEN_PALETTE_EVENT = "bx-open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

export function openSlipSheet() {
  window.dispatchEvent(new Event(OPEN_SLIP_EVENT));
}

export function openSupport() {
  window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT));
}

/** What a nav item with an `action` does instead of navigating. */
export function runNavAction(action: NavAction) {
  if (action === "ask") openAsk();
  else if (action === "install") window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
  else if (action === "slip") openSlipSheet();
  else if (action === "support") openSupport();
  else if (action === "tour") openTour();
}

export function openNotifications() {
  window.dispatchEvent(new Event(OPEN_NOTIFY_EVENT));
}
