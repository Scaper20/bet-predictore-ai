"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useOverlay } from "@/components/ui/use-overlay";
import { useClaimsPriorityPopup, usePriorityPopupActive } from "@/components/ui/popup-priority";
import { OPEN_TOUR_EVENT, TOUR_DONE_KEY } from "@/lib/tour";

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

const STEPS: Step[] = [
  {
    targets: [],
    title: "Welcome to KiqStat",
    body: "A 30-second tour of how to read the predictions and what you can do with them.",
  },
  {
    targets: ['[data-tour="card"]'],
    title: "Every match, a probability",
    body: "Each card shows the model's read on a match and its strongest pick. Tap it for form, stats, head-to-head and every prediction type.",
  },
  {
    targets: ['[data-tour="pick"]'],
    title: "Add picks to a combo",
    body: "Like a pick? Add it to your combo. We show the real chance of every pick in it landing together.",
  },
  {
    targets: ['[data-tour="combo"]', '[data-tour="combos"]'],
    title: "My combos",
    body: "Track a combo and it lives here: every game followed live, and the result once the final whistle goes.",
  },
  {
    targets: ['[data-tour="scores"]'],
    title: "Live, fixtures and results",
    body: "One place for every game: what's on now, what's coming up and how it finished, with how our picks did.",
  },
  {
    targets: ['[data-tour="forge"]'],
    title: "Let Forge build one",
    body: "Choose safe, balanced or risky and how many games. Forge picks the matches from the model's own numbers.",
  },
  {
    targets: ['[data-tour="code-hub"]'],
    title: "Code Hub",
    body: "Five ready-made combos a day, from about 2 to 20 odds, each with a SportyBet code. Coming soon: join the waitlist to hear first.",
  },
  {
    targets: ['[data-tour="ask"]'],
    title: "Ask anything",
    body: "Ask about any match in plain words, like “Is Arsenal v Chelsea a high-scoring game?” Answers come from the same model.",
  },
  {
    targets: [],
    title: "You're set",
    body: "Every pick on every match is free to read. Every pick is graded after the final whistle on the track record. Replay this tour any time from Help.",
  },
];

/** Pages with prediction cards to point at. */
const AUTO_PATHS = [/^\/$/, /^\/[a-z]+\/predictions\/?$/];
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

function done(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === "1";
  } catch {
    return true; // storage blocked: never nag on every visit
  }
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
    if (open || priorityHeld || done() || !AUTO_PATHS.some((re) => re.test(pathname))) return;
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

      <div className="absolute rounded-2xl border border-line bg-shell p-5 shadow-2xl" style={cardStyle}>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
          {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="mt-2 font-display text-lg font-bold text-ink">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          {last ? (
            <span />
          ) : (
            <button type="button" onClick={close} className="text-xs font-medium text-ink-dim hover:text-ink">
              Skip tour
            </button>
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                Back
              </button>
            )}
            <button
              ref={initialFocusRef}
              type="button"
              onClick={next}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
            >
              {index === 0 ? "Show me" : last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
