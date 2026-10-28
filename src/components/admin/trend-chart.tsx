"use client";

import { useId, useState } from "react";

export type TrendFormat = "count" | "naira" | "pct";

export interface TrendPoint {
  /** ISO day (yyyy-mm-dd). */
  day: string;
  value: number;
  /** Optional second line for the tooltip, e.g. "12 graded". */
  note?: string;
}

function fmt(v: number, f: TrendFormat, compact = false): string {
  if (f === "pct") return `${Math.round(v * 100)}%`;
  if (f === "naira") {
    if (compact && v >= 1000) return `₦${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`}`;
    return `₦${Math.round(v).toLocaleString()}`;
  }
  if (compact && v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return Math.round(v).toLocaleString();
}

function dayLabel(day: string, long = false): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
}

/** Clean axis steps: 0, then a round number at a third and two thirds of the top, then the top. */
function niceMax(max: number, f: TrendFormat): number {
  if (f === "pct") return 1;
  if (max <= 0) return 3;
  const raw = max * 1.1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1.5 ? 1.5 : norm <= 3 ? 3 : norm <= 6 ? 6 : 10;
  return step * mag;
}

/**
 * Daily columns with a hover and keyboard readout. One series, so no legend:
 * the panel title names it. The latest day and the peak carry direct labels;
 * the tooltip carries every other value, and the axis the scale.
 *
 * Marks: columns at most 24px wide with a 2px gap, rounded at the data end
 * and square at the baseline; hairline solid gridlines a step off the
 * surface.
 */
export function TrendChart({
  points,
  format = "count",
  height = 168,
  tone = "brand",
  label,
}: {
  points: TrendPoint[];
  format?: TrendFormat;
  height?: number;
  tone?: "brand" | "cyan" | "gold" | "violet";
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = points.length;
  if (n === 0) return <p className="py-10 text-center text-xs text-ink-dim">No data yet.</p>;

  const top = niceMax(Math.max(...points.map((p) => p.value)), format);
  const ticks = [0, top / 3, (top * 2) / 3, top];
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const last = n - 1;
  const total = points.reduce((s, p) => s + p.value, 0);
  const color = { brand: "bg-brand", cyan: "bg-cyan", gold: "bg-gold", violet: "bg-violet" }[tone];
  const active = hover ?? null;

  return (
    <figure className="select-none" aria-label={label}>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-9 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="tnum absolute right-0 -translate-y-1/2 font-mono text-[9.5px] text-ink-dim"
              style={{ top: `${100 - (t / top) * 100}%` }}
            >
              {fmt(t, format, true)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ top: `${100 - (t / top) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {points.map((p, i) => {
              const h = top > 0 ? (p.value / top) * 100 : 0;
              const labelled = (i === last || i === peak) && p.value > 0;
              return (
                <button
                  key={p.day}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${dayLabel(p.day, true)}: ${fmt(p.value, format)}${p.note ? `, ${p.note}` : ""}`}
                  aria-describedby={active === i ? `${id}-tip` : undefined}
                >
                  <span
                    className={`relative w-full max-w-6 rounded-t-[4px] transition-opacity ${color} ${
                      active === null || active === i ? "opacity-100" : "opacity-35"
                    } ${p.value === 0 ? "opacity-0" : ""}`}
                    style={{ height: `${Math.max(p.value > 0 ? 1.5 : 0, h)}%` }}
                  >
                    {labelled && active === null && (
                      <span className="tnum absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] text-ink-muted">
                        {fmt(p.value, format, true)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {active !== null && (
            <div
              id={`${id}-tip`}
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 whitespace-nowrap rounded-md border border-line-strong bg-shell px-2.5 py-1.5 shadow-lg"
              style={{
                left: `${((active + 0.5) / n) * 100}%`,
                transform: `translate(${active / n > 0.7 ? "-100%" : active / n < 0.3 ? "0" : "-50%"}, -100%)`,
              }}
            >
              <p className="tnum font-mono text-sm font-medium text-ink">{fmt(points[active].value, format)}</p>
              <p className="text-[10.5px] text-ink-dim">
                {dayLabel(points[active].day, true)}
                {points[active].note ? ` · ${points[active].note}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-11 font-mono text-[9.5px] text-ink-dim" aria-hidden>
        <span>{dayLabel(points[0].day)}</span>
        {n > 10 && <span>{dayLabel(points[Math.floor(n / 2)].day)}</span>}
        <span>{dayLabel(points[last].day)}</span>
      </div>
      <figcaption className="sr-only">
        {label}. {n} days, total {fmt(total, format)}, peak {fmt(points[peak].value, format)} on {dayLabel(points[peak].day, true)}.
      </figcaption>
    </figure>
  );
}
