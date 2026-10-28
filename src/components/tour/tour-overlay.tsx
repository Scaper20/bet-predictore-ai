"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useOverlay } from "@/components/ui/use-overlay";
import { useClaimsPriorityPopup, usePriorityPopupActive } from "@/components/ui/popup-priority";
import { OPEN_TOUR_EVENT, TOUR_CLOSED_EVENT, TOUR_DONE_KEY, tourDone, tourStartsOn } from "@/lib/tour";

/**
 * A first-visit walkthrough: a dimmed page with a spotlight on one real
 * control at a time, and a short card saying what it does.
 *
 * Steps point at elements by `data-tour` (the bottom bar on phones, the
 * top bar on desktop), so the tour shows the actual buttons rather than a
 * picture of them. A step whose element is missing or hidden on this screen size is
 * skipped; the welcome and closing steps have no target and sit centred.
 *
 * Starts on its own once per browser, on the pages that have prediction cards
 * to point at, and again whenever OPEN_TOUR_EVENT fires (Help page, More menu).
 * It claims the shared popup slot while open, so the timed WhatsApp, install
 * and notification prompts wait their turn.
 */

type Step = { targets: string[]; title: string; body: string };

/**
 * Short on purpose: five stops, one line each. It shows where the value is
 * (a card, a combo, the Code Hub, Forge) and ends by naming what VIP adds,
 * because the day-pass offer (components/day-pass) opens straight after it
 * closes, finished or skipped.
 */
const STEPS: Step[] = [
  {
    targets: [],
    title: "Welcome to KiqStat",
    body: "Every match, read by a model that shows its record. A 20-second look around.",
  },
  {
    targets: ['[data-tour="card"]'],
    title: "Tap any match",
    body: "The pick, the chance it lands, and the stats behind it.",
  },
  {
    targets: ['[data-tour="pick"]'],
    title: "Build a combo",
    body: "Add picks and see the real chance of them all landing together.",
  },
  {
    targets: ['[data-tour="code-hub"]'],
    title: "Codes, ready to play",
    body: "Daily combos from 2 to 20 odds, each with a SportyBet code.",
  },
  {
    targets: ['[data-tour="forge"]'],
    title: "Or let Forge build it",
    body: "Name your odds. Forge stacks the strongest picks to get there.",
  },
  {
    targets: [],
    title: "Free covers 27 competitions",
    body: "VIP opens the rest: Pro-league picks before kick-off, every combo and every prediction type.",
  },
];

const AUTO_DELAY_MS = 1500;
const PAD = 8;

function visible(el: Element): el is HTMLElement {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findTarget(step: Step): HTMLElement | null {
  for (const sel of step.targets) {
    for (const el of document.querySelectorAll(sel)) if (visible(el)) return el;
  }
  return null;
}

function hasTarget(step: Step) {
  return step.targets.length === 0 || findTarget(step) !== null;
}

function markDone() {
  try {
    localStorage.setItem(TOUR_DONE_KEY, "1");
  } catch {}
}

export function TourOverlay() {
  const pathname = usePathname();
  const priorityHeld = usePriorityPopupActive();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const close = useCallback(() => {
    markDone();
    setOpen(false);
    window.dispatchEvent(new Event(TOUR_CLOSED_EVENT));
  }, []);
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(open, close);
  useClaimsPriorityPopup(open);

  // Steps that can be shown on this screen, worked out when the tour opens.
  const [steps, setSteps] = useState<Step[]>(STEPS);
  const start = useCallback(() => {
    setSteps(STEPS.filter(hasTarget));
    setIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onOpen = () => start();
    window.addEventListener(OPEN_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
  }, [start]);

  useEffect(() => {
    if (open || priorityHeld || tourDone() || !tourStartsOn(pathname)) return;
    const t = window.setTimeout(start, AUTO_DELAY_MS);
    return () => window.clearTimeout(t);
    // priorityHeld is read once: a gift showing first simply means the tour
    // waits for the next visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const step = steps[index];

  // Bring the target into view, then measure it; re-measure on resize/scroll.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = findTarget(step);
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    // Measured on the next frame, after the scroll has applied.
    const measure = () => setRect(el ? el.getBoundingClientRect() : null);
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const last = index === steps.length - 1;
  // Set by the day-pass offer while it is open to this visitor; it opens as this closes.
  const offerLive = typeof document !== "undefined" && document.documentElement.dataset.dayPass === "offer";
  const next = () => (last ? close() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Card placement: below the target if there is room, otherwise above;
  // centred when there is no target.
  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const cardW = Math.min(360, vw - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.bottom + PAD + 12;
    const roomBelow = vh - below > 200;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16);
    cardStyle = roomBelow
      ? { top: below, left, width: cardW }
      : { bottom: vh - rect.top + PAD + 12, left, width: cardW };
  } else {
    cardStyle = { top: "50%", left: "50%", width: cardW, transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" ref={containerRef}>
      {/* The dimmed page. With a target, the dimming is the spotlight's own
          shadow, so the target stays bright and visible through it. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.72)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/72" />
      )}
      {/* Catches taps on the dimmed page so nothing behind is clicked by accident. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div className="absolute overflow-hidden rounded-2xl border border-line bg-shell p-5 shadow-2xl" style={cardStyle}>
        <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-1 rounded-full transition-all ${i === index ? "w-5 bg-brand" : i < index ? "w-1.5 bg-brand/50" : "w-1.5 bg-line-strong"}`}
            />
          ))}
        </div>
        <h2 id="tour-title" className="mt-3 font-display text-lg font-bold text-ink">
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          {last ? (
            <span />
          ) : (
            <button type="button" onClick={close} className="min-h-10 text-xs font-medium text-ink-dim hover:text-ink">
              Skip
            </button>
          )}
          <div className="flex gap-2">
            {index > 0 && !last && (
              <button
                type="button"
                onClick={back}
                className="min-h-10 rounded-lg border border-line px-3.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                Back
              </button>
            )}
            <button
              ref={initialFocusRef}
              type="button"
              onClick={next}
              className={`min-h-10 rounded-lg px-4 text-sm font-bold ${
                last && offerLive ? "bg-gold text-gold-ink hover:bg-gold-strong" : "bg-brand text-brand-ink hover:bg-brand-strong"
              }`}
            >
              {index === 0 ? "Show me" : last ? (offerLive ? "See the VIP offer" : "Got it") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
