"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { submitFeedback, type FeedbackActionState } from "@/app/actions/feedback";
import { Button, Spinner } from "@/components/ui/primitives";

const initialState: FeedbackActionState = { error: null, ok: false };
const SNOOZE_KEY = "bx_feedback_snoozed_until";
const SNOOZE_DAYS = 14;

/** Reads/writes the snooze timestamp defensively — private browsing, a full
 * quota, or a locked-down browser can all make localStorage throw, and a
 * feedback prompt is the last thing worth crashing the page over. */
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
    // Not persisted this time — the tab just reappears next visit, which is
    // a mild annoyance, not a bug worth surfacing.
  }
}

// Nothing outside this module ever changes the snooze flag mid-session, so
// subscribe is a no-op — this is only here to read a browser-only value
// (localStorage) without a hydration mismatch: the server always renders
// "not snoozed" (the tab visible), same as useSlip's getServerSnapshot in
// src/lib/slip.ts, and the client corrects itself right after mount.
function subscribe() {
  return () => {};
}
const getServerSnapshot = () => false;

/**
 * A small edge tab rather than another floating circular button — ChatWidget
 * already owns the bottom-right corner and ScrollToTop the bottom-left, so a
 * third corner button would either collide or force an arbitrary fourth
 * position. Vertically centered on the opposite edge from both stays out of
 * their way and reads as "here if you want it," which is the point: this is
 * for people who have an opinion, not an interruption aimed at everyone.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dismissed = useSyncExternalStore(subscribe, isSnoozed, getServerSnapshot);
  const [state, formAction, pending] = useActionState(submitFeedback, initialState);

  useEffect(() => {
    if (!state.ok) return;
    snooze();
    const timer = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(timer);
  }, [state.ok]);

  if (dismissed) return null;

  return (
    <div className="fixed right-0 top-1/2 z-40 -translate-y-1/2">
      {open && (
        <div className="absolute right-full top-1/2 mr-3 w-72 -translate-y-1/2 rounded-2xl border border-line bg-shell p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Quick feedback</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
              className="text-ink-dim hover:text-ink"
            >
              ✕
            </button>
          </div>

          {state.ok ? (
            <p className="py-4 text-center text-sm text-ink-muted">Thanks — that helps.</p>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="pagePath" value={pathname} />

              <fieldset>
                <legend className="mb-2 text-xs text-ink-muted">
                  How likely are you to recommend BetriX to a friend?
                </legend>
                <div className="grid grid-cols-11 gap-0.5">
                  {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                    <label key={n} className="cursor-pointer">
                      <input type="radio" name="score" value={n} className="peer sr-only" />
                      <span className="grid h-7 place-items-center rounded text-[10px] font-medium text-ink-muted peer-checked:bg-brand peer-checked:text-brand-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-surface-2">
                        {n}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-ink-dim">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1.5 block text-xs text-ink-muted">
                  One thing we could do better? (optional)
                </span>
                <textarea
                  name="comment"
                  rows={3}
                  maxLength={2000}
                  placeholder="Genuinely curious — tell us anything."
                  className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand/50"
                />
              </label>

              {state.error && <p className="text-xs text-rose">{state.error}</p>}

              <Button type="submit" disabled={pending} className="w-full py-2 text-xs">
                {pending ? <Spinner className="size-3.5" /> : null}
                {pending ? "Sending…" : "Send feedback"}
              </Button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close feedback" : "Give feedback"}
        className="-mr-px rounded-l-lg border border-r-0 border-line bg-surface-2/90 px-2 py-3 text-[11px] font-semibold tracking-wide text-ink-muted shadow-lg backdrop-blur-md transition-colors hover:bg-surface-3 hover:text-ink"
        style={{ writingMode: "vertical-rl" }}
      >
        Feedback
      </button>
    </div>
  );
}
