"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSlip } from "@/lib/slip";
import { isTracked, trackSlip, useTrackedSlips } from "@/lib/tracked-slips";
import { sportPath } from "@/lib/routes";
import { useAskState } from "@/lib/ask-store";
import { useOverlay } from "@/components/ui/use-overlay";
import { SlipView } from "@/components/match/slip-view";
import { OPEN_SLIP_EVENT } from "@/components/layout/nav-actions";

/**
 * The slip, as an overlay over whatever page you're on, the way a bookmaker's
 * betslip works: a floating button with the count in the corner (where the
 * support chat used to be), and a sheet that slides up over the page. No page
 * title or explainer; people know what a betslip is.
 *
 * Opens from the button, from OPEN_SLIP_EVENT (menus, Forge, My slips), and
 * from a link ending in #slip (the old /slip page redirects to one).
 */
export function SlipSheet() {
  const { legs, clear } = useSlip();
  const pathname = usePathname();
  const askOpen = useAskState().open;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(open, close);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SLIP_EVENT, onOpen);
    const t = window.setTimeout(() => {
      if (window.location.hash === "#slip") {
        setOpen(true);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }, 0);
    return () => {
      window.removeEventListener(OPEN_SLIP_EVENT, onOpen);
      window.clearTimeout(t);
    };
  }, []);

  // A link inside the sheet (a fixture, Browse picks) moves on: close behind it.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  const count = legs.length;
  // Forge has its own action bar in that corner on phones; Ask covers it while open.
  const onForge = /\/forge\/?$/.test(pathname);

  return (
    <>
      {count > 0 && !open && !askOpen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open slip, ${count} ${count === 1 ? "selection" : "selections"}`}
          className={`fixed right-5 z-50 grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg glow-brand transition-transform hover:scale-105 lift-above-bottom-nav ${onForge ? "max-lg:hidden" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14l-3-2-2 2-2-2-2 2-2-2-3 2V5Z" />
            <path strokeLinecap="round" d="M8.5 9.5h7M8.5 13h4" />
          </svg>
          <span
            key={count}
            className="tnum slip-pop absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full border-2 border-shell bg-ink px-1.5 text-[11px] font-bold leading-5 text-shell"
          >
            {count}
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60]" role="presentation">
          <button type="button" aria-label="Close slip" tabIndex={-1} onClick={close} className="slip-fade absolute inset-0 bg-black/55" />
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Your slip"
            className="slip-rise absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-shell shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[26rem] lg:rounded-none lg:border-l lg:border-t-0"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" aria-hidden />
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 font-display text-lg font-bold">
                Slip
                {count > 0 && <span className="tnum rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">{count}</span>}
              </p>
              <div className="ml-auto flex items-center gap-1">
                {count > 0 && (
                  <button type="button" onClick={clear} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:bg-surface-2 hover:text-rose">
                    Clear all
                  </button>
                )}
                <button
                  ref={initialFocusRef}
                  type="button"
                  onClick={close}
                  aria-label="Close slip"
                  className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" className="lg:hidden" />
                    <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" className="hidden lg:block" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <SlipView variant="sheet" />
            </div>

            {count > 0 && <SheetFooter onDone={close} />}
          </div>
        </div>
      )}
    </>
  );
}

/** Track the slip, or jump to it in My slips once it's tracked. */
function SheetFooter({ onDone }: { onDone: () => void }) {
  const { legs } = useSlip();
  const tracked = useTrackedSlips();
  const router = useRouter();
  const existing = isTracked(tracked, legs);

  return (
    <div className="flex gap-2 border-t border-line px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <Link
        href={sportPath("trackedSlips")}
        onClick={onDone}
        className="grid place-items-center rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink-muted hover:text-ink"
      >
        My slips
      </Link>
      {existing ? (
        <Link
          href={sportPath("trackedSlips")}
          onClick={onDone}
          className="flex flex-1 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 py-3 text-sm font-bold text-brand"
        >
          ✓ Tracking · view it
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (trackSlip(legs)) {
              onDone();
              router.push(sportPath("trackedSlips"));
            }
          }}
          className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-ink hover:bg-brand-strong"
        >
          Track this slip
        </button>
      )}
    </div>
  );
}
