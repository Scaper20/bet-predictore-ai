"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/whatsapp-community";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { ExternalButtonLink } from "@/components/ui/primitives";
import { useOverlay } from "@/components/ui/use-overlay";
import { usePriorityPopupActive } from "@/components/ui/popup-priority";

const SNOOZE_KEY = "bx_whatsapp_popup_snoozed_until";
const SNOOZE_DAYS = 1; // once per calendar visit-day, not once ever
const SHOW_DELAY_MS = 6_000;
const AUTO_DISMISS_MS = 8_000;

/** Same defensive-localStorage shape as feedback-widget.tsx — private
 * browsing or a locked-down browser should degrade to "just don't show
 * it again this load," never throw. */
function isSnoozed(): boolean {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    return !!until && Number(until) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {
    // Not persisted this time — it just shows again next load, which is a
    // mild annoyance, not a bug worth surfacing.
  }
}

// Same reasoning as feedback-widget.tsx: read a browser-only value without
// a hydration mismatch by always rendering "not snoozed" on the server.
function subscribe() {
  return () => {};
}
const getServerSnapshot = () => false;

/**
 * A timed popup, not a persistent widget like ChatWidget/FeedbackWidget —
 * appears once per day, stays for a short window whether or not anyone
 * interacts with it, then closes itself. Renders nothing at all until
 * NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL is set.
 */
export function WhatsAppPopup() {
  const alreadySnoozed = useSyncExternalStore(subscribe, isSnoozed, getServerSnapshot);
  // A gift-congratulations popup (GiftPopup) always wins the shared overlay
  // slot — rarer, more time-sensitive, and its "seen" state is server-side
  // so it can't just be shown again tomorrow the way this one can.
  const priorityActive = usePriorityPopupActive();
  const [visible, setVisible] = useState(false);
  const [barWidth, setBarWidth] = useState("100%");
  const close = () => setVisible(false);
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(visible, close);

  useEffect(() => {
    // A gift popup showing up after this timer already started is a rare
    // enough race (it typically resolves in well under SHOW_DELAY_MS) that
    // it's not worth chasing here — this only needs to stop the timer from
    // ever starting while one is already active.
    if (alreadySnoozed || !WHATSAPP_COMMUNITY_URL || priorityActive) return;
    const showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(showTimer);
  }, [alreadySnoozed, priorityActive]);

  useEffect(() => {
    if (!visible) return;
    // Counts as "shown" the moment it actually appears, not when it was
    // merely scheduled to. barWidth already starts at "100%" (the component
    // fully unmounts when not visible, so its state is fresh every time this
    // runs) — flipping to "0%" one frame later is what gives the CSS
    // transition below an actual 100% -> 0% change to animate.
    snooze();
    const raf = requestAnimationFrame(() => setBarWidth("0%"));
    const dismissTimer = setTimeout(close, AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(dismissTimer);
    };
  }, [visible]);

  if (!WHATSAPP_COMMUNITY_URL || !visible) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-canvas/70 p-4 backdrop-blur-sm">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-popup-title"
        className="card relative w-full max-w-sm overflow-hidden"
      >
        <div className="h-[3px] w-full bg-surface-3">
          <div
            className="h-full bg-brand"
            style={{ width: barWidth, transition: `width ${AUTO_DISMISS_MS}ms linear` }}
          />
        </div>

        <div className="p-6">
          <button
            ref={initialFocusRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-surface-2 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            ✕
          </button>

          <div className="mb-4 grid size-12 place-items-center rounded-xl border border-brand/25 bg-brand/12 text-brand">
            <WhatsAppIcon className="size-6" />
          </div>

          <h2 id="whatsapp-popup-title" className="font-display text-xl font-bold text-ink">
            Get today&rsquo;s picks on WhatsApp
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Join the community — one message a day, before kickoff, to everyone at once. Only
            picks that clear our sample-size bar. Free, leave anytime.
          </p>

          <ExternalButtonLink href={WHATSAPP_COMMUNITY_URL} className="mt-5 w-full gap-2" variant="primary">
            <WhatsAppIcon className="size-[18px]" />
            Join the WhatsApp community
          </ExternalButtonLink>
          <button
            type="button"
            onClick={close}
            className="mt-2 w-full py-1 text-center text-xs text-ink-dim transition-colors hover:text-ink"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
