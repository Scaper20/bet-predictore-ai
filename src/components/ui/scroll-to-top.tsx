"use client";

import { useEffect, useState } from "react";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top"
      className="fixed bottom-6 right-6 z-50 grid size-11 place-items-center rounded-full border border-line bg-surface-2/90 text-ink shadow-2xl backdrop-blur-md transition-all duration-300 ease-in-out hover:scale-110 hover:border-brand hover:bg-brand hover:text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand/50 active:scale-95"
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
