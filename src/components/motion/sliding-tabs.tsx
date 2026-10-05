"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SlidingTab {
  key: string;
  label: ReactNode;
  /** Optional small count or note under/after the label. */
  meta?: ReactNode;
}

/**
 * A segmented control whose highlight glides to the chosen tab.
 *
 * The pill is one absolutely positioned element moved with a transform and
 * resized with width, both measured from the active button, so it travels
 * rather than blinking from one place to another. It re-measures on resize
 * (labels wrap, fonts load late) and scrolls the active tab into the middle
 * of the row when the row overflows on a phone.
 */
export function SlidingTabs({
  tabs,
  value,
  onChange,
  variant = "pill",
  ariaLabel,
  className = "",
}: {
  tabs: SlidingTab[];
  value: string;
  onChange: (key: string) => void;
  variant?: "pill" | "underline";
  ariaLabel: string;
  className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>(`[data-key="${CSS.escape(value)}"]`);
      if (!btn) return setBox(null);
      setBox({ x: btn.offsetLeft, w: btn.offsetWidth });
      if (el.scrollWidth > el.clientWidth) {
        el.scrollTo({ left: btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2, behavior: "smooth" });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, tabs.length]);

  const underline = variant === "underline";

  return (
    <div
      ref={row}
      role="tablist"
      aria-label={ariaLabel}
      className={`no-scrollbar relative flex overflow-x-auto ${underline ? "gap-1 border-b border-line" : "gap-1 rounded-xl border border-line bg-surface-2 p-1"} ${className}`}
    >
      {box && (
        <span
          aria-hidden
          className={`pointer-events-none absolute transition-[transform,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            underline
              ? "bottom-0 left-0 h-0.5 rounded-full bg-brand"
              : "top-1 bottom-1 left-0 rounded-lg bg-surface-3 shadow-[0_1px_0_0_var(--color-line-strong)_inset,0_6px_16px_-8px_rgb(0_0_0/0.6)]"
          }`}
          style={{ transform: `translateX(${box.x}px)`, width: box.w }}
        />
      )}
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative z-10 flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-300 ${
              underline ? "px-3.5 pb-3 pt-2 text-sm" : "rounded-lg px-3.5 py-2 text-sm"
            } ${on ? "text-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {t.label}
            {t.meta !== undefined && <span className={`tnum text-xs ${on ? "text-brand" : "text-ink-dim"}`}>{t.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
