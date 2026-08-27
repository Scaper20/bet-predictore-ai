"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades and rises children in once they scroll into view, reusing the same
 * .animate-rise language the hero already plays on mount. Fires once and
 * disconnects — this is an entrance, not a scroll-linked effect.
 *
 * Reduced-motion handling lives entirely in the .reveal-pending CSS rule
 * (see globals.css), not in JS state, so there is no client/server branching
 * on `window` during render.
 */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!("IntersectionObserver" in window)) {
      el.classList.add("animate-rise");
      el.classList.remove("reveal-pending");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? "animate-rise" : "reveal-pending"} ${className}`}>
      {children}
    </div>
  );
}
