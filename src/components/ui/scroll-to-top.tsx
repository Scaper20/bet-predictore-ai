"use client";

import { useEffect, useState } from "react";

const THRESHOLD = 300;

/**
 * Back-to-top affordance, bottom-LEFT.
 *
 * It sat at `bottom-6 right-6` — the exact rectangle ChatWidget's launcher
 * occupies — so on any page long enough to show it, it covered the support
 * button. The two are the only fixed-position controls in the app, so they
 * take opposite corners.
 *
 * Kept mounted rather than unmounted while hidden: `return null` meant the
 * transition never had two states to animate between, so the button popped in
 * and out. Hidden state is inert to the keyboard and to pointers, so an
 * invisible control is never a tab stop.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // The scroll event fires far more often than the answer changes — the
    // value only flips twice per page — so the read is coalesced to one per
    // frame and setState is left to bail on an unchanged value.
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(window.scrollY > THRESHOLD);
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  function scrollToTop() {
    // Smooth scrolling is motion the user may have asked the OS to suppress.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed left-6 z-50 lift-above-bottom-nav grid size-11 place-items-center rounded-full border border-line bg-surface-2/90 text-ink shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out hover:border-brand hover:bg-brand hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-95 ${
        visible
          ? "translate-y-0 opacity-100 hover:scale-110"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg
        className="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          d="M5 15l7-7 7 7"
        />
      </svg>
    </button>
  );
}
