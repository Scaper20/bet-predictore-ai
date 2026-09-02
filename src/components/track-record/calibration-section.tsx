"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/primitives";
import type { CalibrationApiResponse, CalibrationResult, MarketFamily } from "@/lib/calibration";

const CalibrationChart = dynamic(
  () => import("@/components/track-record/calibration-chart").then((m) => m.CalibrationChart),
  {
    ssr: false,
    loading: () => (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    ),
  },
);

/** "all" is the default filter — kept distinct from `null` in the fetch cache
 * key so the initial server-computed result (always the aggregate) can be
 * reused without a network round trip until the user actually picks a
 * different market. */
type MarketKey = "all" | MarketFamily;

/**
 * Tier-1 badge (always rendered, zero client JS beyond this toggle) plus the
 * Tier-2 "View the data" panel (Recharts, lazy-loaded — see calibration-chart.tsx
 * — so its JS never ships to a visitor who never expands it).
 */
export function CalibrationSection({ initial }: { initial: CalibrationResult }) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketKey>("all");
  const [cache, setCache] = useState<Partial<Record<MarketKey, CalibrationApiResponse>>>({
    all: { available: initial.score !== null, market: null, ...initial } as CalibrationApiResponse,
  });
  const [loading, setLoading] = useState(false);

  const current = cache[market];

  async function selectMarket(next: MarketKey) {
    setMarket(next);
    if (cache[next]) return;
    setLoading(true);
    try {
      const url = next === "all" ? "/api/calibration" : `/api/calibration?market=${next}`;
      const res = await fetch(url);
      const data = (await res.json()) as CalibrationApiResponse;
      setCache((prev) => ({ ...prev, [next]: data }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">Calibration Score</p>
      {initial.score !== null ? (
        <>
          <p className="tnum mt-2 font-display text-3xl font-extrabold">{initial.score}/100</p>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
            When BetriX says 70%, it wins about 70% of the time.
          </p>
        </>
      ) : (
        <>
          <p className="tnum mt-2 font-display text-3xl font-extrabold text-ink-muted">—</p>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
            Not enough settled predictions yet to report this reliably.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-[11px] font-semibold text-brand hover:underline"
      >
        {open ? "Hide the data" : "View the data →"}
      </button>

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          {loading && !current ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : current?.available ? (
            <CalibrationChart
              result={current}
              market={market}
              onMarketChange={selectMarket}
              loading={loading}
            />
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">
              Not enough settled predictions yet for this view.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
