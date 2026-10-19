"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A horizontally scrolling row of chips that works with a mouse as well as a
 * finger. On a phone it is the plain swipeable strip it always was. With a
 * mouse there is no horizontal swipe, and a hidden scrollbar leaves nothing
 * to drag, so the row also scrolls on the wheel and shows arrow buttons
 * at whichever end still has chips past the edge.
 *
 * The chip marked aria-current (or data-active) is brought into view on
 * load, so a filter picked far down the row is not left off screen.
 */
export function ScrollRow({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible name for the row. */
  label?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current="page"], [data-active="true"]');
    if (active && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = active.offsetLeft - el.clientWidth / 2 + active.clientWidth / 2;
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // A vertical wheel scrolls the row sideways, but only while it has room
    // to move that way, so the page still scrolls past it at either end.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);

  const nudge = (dir: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={row}
        role={label ? "group" : undefined}
        aria-label={label}
        onScroll={measure}
        className={`no-scrollbar flex overflow-x-auto ${className}`}
      >
        {children}
      </div>
      <Arrow side="start" show={edges.start} onClick={() => nudge(-1)} />
      <Arrow side="end" show={edges.end} onClick={() => nudge(1)} />
    </div>
  );
}

function Arrow({ side, show, onClick }: { side: "start" | "end"; show: boolean; onClick: () => void }) {
  const start = side === "start";
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 hidden items-center transition-opacity duration-200 [@media(hover:hover)]:flex ${
        start ? "left-0 bg-gradient-to-r pr-8" : "right-0 bg-gradient-to-l pl-8"
      } from-canvas via-canvas/90 to-transparent ${show ? "opacity-100" : "opacity-0"}`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={start ? "Scroll back" : "Scroll on"}
        onClick={onClick}
        className={`grid size-9 place-items-center rounded-full border border-line-strong bg-surface text-ink shadow-sm transition-colors hover:border-brand/50 hover:text-brand ${
          show ? "pointer-events-auto" : ""
        }`}
      >
        <svg viewBox="0 0 20 20" className={`size-4 ${start ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
