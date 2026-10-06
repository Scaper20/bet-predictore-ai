"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up to its value the first time it scrolls into view,
 * on an ease-out curve so it lands softly. Server-rendered at its final
 * value (crawlers and no-JS readers see the real number), and under
 * prefers-reduced-motion it never animates.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 900,
  className = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  // What is on screen right now, so a new value can count from it.
  const current = useRef(value);
  const revealed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const set = (v: number) => {
      current.current = v;
      setShown(v);
    };
    const run = (from: number) => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        set(from + (value - from) * (1 - Math.pow(1 - t, 4)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window);
    if (still) {
      raf = requestAnimationFrame(() => set(value));
      return () => cancelAnimationFrame(raf);
    }

    // A value that changes after the first count-up (switching a day tab
    // keeps this mounted) counts from the number on screen to the new one.
    // It used to stay on its first value, so every Results date read 0
    // when the page opened on a day with no games.
    if (revealed.current) {
      run(current.current);
      return () => cancelAnimationFrame(raf);
    }

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      revealed.current = true;
      run(0);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`tnum ${className}`}>
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}
