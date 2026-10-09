"use client";

import { useEffect, useRef, useState } from "react";

/**
 * How far along a Forge build is, as a percentage.
 *
 * The server can't report progress mid-request, so the bar is paced from how
 * long builds have actually taken on this device: it eases toward 95% over
 * the usual build time and only reaches 100% when the slip arrives. Each
 * finished build updates the pace, so the bar tracks real speed (a slow day
 * on the price feed makes the next bar slower, not stuck at 99%).
 */

const KEY = "bx_forge_build_ms";
/** First-visit guess before any build has been timed. */
const DEFAULT_MS = 5_000;
/** How long the bar stays on 100% before it hides. */
const DONE_HOLD_MS = 400;

function expectedMs(): number {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= 800 && v <= 60_000 ? v : DEFAULT_MS;
  } catch {
    return DEFAULT_MS;
  }
}

function remember(ms: number) {
  try {
    // Weighted toward the latest build, so the pace follows today's conditions.
    const next = Math.round(expectedMs() * 0.4 + ms * 0.6);
    window.localStorage.setItem(KEY, String(next));
  } catch {
    // Storage blocked: keep the default pace.
  }
}

/** Pure: percentage shown `elapsed` ms into a build expected to take `expected` ms. */
export function paced(elapsed: number, expected: number): number {
  // 1 - e^(-2t/T): about 82% at the expected time, never past 95% on its own.
  return Math.min(95, 95 * (1 - Math.exp((-2 * elapsed) / expected)));
}

/** What the build is doing at that point, matching the real steps. */
export function stageFor(pct: number): string {
  if (pct >= 100) return "Done";
  if (pct < 25) return "Reading the fixtures";
  if (pct < 55) return "Scoring every pick";
  if (pct < 80) return "Fitting your odds and games";
  return "Checking SportyBet prices";
}

export function useBuildProgress(busy: boolean): number | null {
  const [pct, setPct] = useState<number | null>(null);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      const start = Date.now();
      started.current = start;
      const expected = expectedMs();
      const tick = window.setInterval(() => setPct(paced(Date.now() - start, expected)), 100);
      const first = window.setTimeout(() => setPct(0), 0);
      return () => {
        window.clearInterval(tick);
        window.clearTimeout(first);
      };
    }
    if (started.current === null) return;
    remember(Date.now() - started.current);
    started.current = null;
    const show = window.setTimeout(() => setPct(100), 0);
    const hide = window.setTimeout(() => setPct(null), DONE_HOLD_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [busy]);

  return pct;
}

export function BuildProgress({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null) return null;
  const shown = Math.round(pct);
  return (
    <div className={className} role="progressbar" aria-label="Building your slip" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown}>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="font-medium text-ink-muted">{stageFor(pct)}</span>
        <span className="tnum font-bold text-brand">{shown}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-brand transition-[width] duration-150 ease-linear motion-reduce:transition-none" style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}
