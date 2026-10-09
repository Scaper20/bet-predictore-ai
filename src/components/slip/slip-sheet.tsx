"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSlip } from "@/lib/slip";
import { isTracked, trackSlip, useTrackedSlips } from "@/lib/tracked-slips";
import { sportPath } from "@/lib/routes";
import { useAskState } from "@/lib/ask-store";
import { useOverlay } from "@/components/ui/use-overlay";
import { SlipView } from "@/components/match/slip-view";
import { OPEN_SLIP_EVENT } from "@/components/layout/nav-actions";
import { clampPoint, snapToEdge, type Bounds, type Point } from "@/components/slip/fab-position";

/**
 * The slip, as an overlay over whatever page you're on, the way a bookmaker's
 * betslip works: a floating button, always there, with the count once the
 * slip has something on it (it took the support chat's corner, and can be
 * dragged to any edge), and a sheet that slides up over the page. No page
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

  return (
    <>
      {!open && !askOpen && <SlipFab count={count} onOpen={() => setOpen(true)} />}

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
  const { legs, clear } = useSlip();
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
            // Tracked slips live in My slips; the builder empties for the next one.
            if (trackSlip(legs)) {
              clear();
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

const FAB_SIZE = 56;
const FAB_MARGIN = 12;
const FAB_KEY = "bx_slip_fab";

/** The area the button may use: below the header, above the bottom bar. */
function fabBounds(): Bounds {
  const header = document.querySelector("[data-site-header]")?.getBoundingClientRect();
  const nav = document.querySelector("[data-bottom-nav]")?.getBoundingClientRect();
  const top = header ? Math.max(0, header.bottom) : 64;
  // The bar is hidden on desktop (zero height); the viewport's bottom is the edge then.
  const bottom = nav && nav.height > 0 ? nav.top : window.innerHeight;
  return {
    minX: FAB_MARGIN,
    maxX: window.innerWidth - FAB_SIZE - FAB_MARGIN,
    minY: top + FAB_MARGIN,
    maxY: Math.max(top + FAB_MARGIN, bottom - FAB_SIZE - FAB_MARGIN),
  };
}

function savedFab(): Point | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(FAB_KEY) ?? "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The floating slip button. Tap opens the slip; drag moves it, and on release
 * it settles on the nearest edge of the space between header and bottom bar
 * (fab-position.ts). Remembered on this device.
 */
function SlipFab({ count, onOpen }: { count: number; onOpen: () => void }) {
  const [pos, setPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  // Set when a drag ends, so the click the browser fires after it doesn't open the slip.
  const justDragged = useRef(false);

  const place = useCallback((p: Point | null) => {
    const b = fabBounds();
    setPos(p ? snapToEdge(p, b) : { x: b.maxX, y: b.maxY });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => place(savedFab()), 0);
    const onResize = () => setPos((p) => (p ? snapToEdge(p, fabBounds()) : p));
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [place]);

  if (!pos) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y, startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setPos(clampPoint({ x: e.clientX - d.dx, y: e.clientY - d.dy }, fabBounds()));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) return; // a tap: the click handler opens the slip
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 0);
    setDragging(false);
    const snapped = snapToEdge(pos, fabBounds());
    setPos(snapped);
    try {
      window.localStorage.setItem(FAB_KEY, JSON.stringify(snapped));
    } catch {
      // Storage blocked: it just won't be remembered.
    }
  };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        // A drag ends with a click on most browsers; only a tap opens.
        if (justDragged.current) {
          e.preventDefault();
          justDragged.current = false;
          return;
        }
        onOpen();
      }}
      aria-label={count > 0 ? `Open slip, ${count} ${count === 1 ? "selection" : "selections"}` : "Open slip"}
      style={{ left: pos.x, top: pos.y, touchAction: "none" }}
      className={`fixed z-50 grid size-14 place-items-center rounded-full bg-brand text-brand-ink shadow-lg glow-brand select-none ${
        dragging ? "scale-110 cursor-grabbing" : "transition-[left,top,transform] duration-200 ease-out hover:scale-105"
      }`}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14l-3-2-2 2-2-2-2 2-2-2-3 2V5Z" />
        <path strokeLinecap="round" d="M8.5 9.5h7M8.5 13h4" />
      </svg>
      {count > 0 && (
        <span
          key={count}
          className="tnum slip-pop absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full border-2 border-shell bg-ink px-1.5 text-[11px] font-bold leading-5 text-shell"
        >
          {count}
        </span>
      )}
    </button>
  );
}
