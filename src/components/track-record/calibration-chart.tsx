"use client";

import {
  CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip,
  XAxis, YAxis, ZAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import { useState } from "react";
import {
  CALIBRATION_CALC_VERSION, MARKET_FAMILY_LABELS, MIN_BUCKET_SAMPLE, BUCKET_WIDTH_PCT,
  type CalibrationApiResponse, type CalibrationBucket, type MarketFamily,
} from "@/lib/calibration";
import { percent } from "@/lib/format";

type MarketKey = "all" | MarketFamily;
type AvailableResult = Extract<CalibrationApiResponse, { available: true }>;

interface ChartPoint extends CalibrationBucket {
  x: number;
  y: number;
  z: number;
}

const MARKET_OPTIONS: { key: MarketKey; label: string }[] = [
  { key: "all", label: "All markets" },
  ...(Object.entries(MARKET_FAMILY_LABELS) as [MarketFamily, string][]).map(([key, label]) => ({
    key,
    label,
  })),
];

export function CalibrationChart({
  result,
  market,
  onMarketChange,
  loading,
}: {
  result: AvailableResult;
  market: MarketKey;
  onMarketChange: (market: MarketKey) => void;
  loading: boolean;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const points: ChartPoint[] = result.buckets.map((b) => ({
    ...b,
    x: b.meanPredicted,
    y: b.actualHitRate,
    z: Math.max(b.n, 1),
  }));

  return (
    <div>
      <p className="text-xs leading-relaxed text-ink-muted">
        Points on the dashed line mean our predictions matched reality. Above the line = we were
        too cautious; below = we were overconfident.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by market">
        {MARKET_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            disabled={loading}
            onClick={() => onMarketChange(opt.key)}
            aria-pressed={market === opt.key}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              market === opt.key
                ? "border-brand/40 bg-brand/12 text-brand"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          Not enough settled predictions yet for this view.
        </p>
      ) : (
        <>
          <div className="mt-4 h-72 w-full" aria-hidden>
            <CalibrationScatter points={points} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-ink-dim">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-brand" />
              Reliable sample (n ≥ {MIN_BUCKET_SAMPLE})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border border-ink-dim" />
              Low sample size (n &lt; {MIN_BUCKET_SAMPLE})
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Calibration by predicted-probability bucket, {BUCKET_WIDTH_PCT} point width
              </caption>
              <thead>
                <tr className="text-ink-dim">
                  <th scope="col" className="py-1.5 pr-4 font-medium">Predicted</th>
                  <th scope="col" className="py-1.5 pr-4 font-medium">Actual hit rate</th>
                  <th scope="col" className="py-1.5 font-medium">Predictions</th>
                </tr>
              </thead>
              <tbody>
                {result.buckets.map((b) => (
                  <tr key={b.bucket} className="tnum border-t border-line text-ink-muted">
                    <td className="py-1.5 pr-4">
                      {b.bucket}–{b.bucket + BUCKET_WIDTH_PCT}%
                    </td>
                    <td className="py-1.5 pr-4">{percent(b.actualHitRate, 0)}</td>
                    <td className="py-1.5">
                      {b.n}
                      {b.belowThreshold && (
                        <span className="ml-1.5 text-ink-dim">(low sample)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-5 rounded-lg bg-surface-2 px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
        Most tipsters show you a win rate. We show you whether our confidence levels can be
        trusted — because a 90% pick should win far more often than a 55% pick.
      </p>

      <button
        type="button"
        onClick={() => setInfoOpen((v) => !v)}
        className="mt-3 text-[11px] font-medium text-ink-dim hover:text-ink-muted"
      >
        {infoOpen ? "Hide" : "ⓘ What does this mean?"}
      </button>
      {infoOpen && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">
          A bucket above the dashed line means outcomes happened more often than we said
          (underconfidence). Below the line means they happened less often (overconfidence).
          Buckets are built from every settled pick ever published — nothing is excluded after the
          fact. Calibration method v{CALIBRATION_CALC_VERSION}.
        </p>
      )}
    </div>
  );
}

function CalibrationScatter({ points }: { points: ChartPoint[] }) {
  const percentTick = (v: number) => percent(v, 0);
  return (
    <ResponsiveContainer>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[0, 1]}
          tickFormatter={percentTick}
          stroke="var(--color-ink-dim)"
          tick={{ fill: "var(--color-ink-dim)", fontSize: 11 }}
          name="Predicted probability"
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0, 1]}
          tickFormatter={percentTick}
          stroke="var(--color-ink-dim)"
          tick={{ fill: "var(--color-ink-dim)", fontSize: 11 }}
          name="Actual hit rate"
        />
        <ZAxis type="number" dataKey="z" range={[60, 360]} name="Sample size" />
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ]}
          stroke="var(--color-line-strong)"
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
        <Tooltip content={CalibrationTooltip} cursor={{ stroke: "var(--color-line-strong)" }} />
        <Scatter data={points} fill="var(--color-brand)">
          {points.map((p) => (
            <Cell
              key={p.bucket}
              fill={p.belowThreshold ? "transparent" : "var(--color-brand)"}
              stroke={p.belowThreshold ? "var(--color-ink-dim)" : "var(--color-brand)"}
              strokeWidth={p.belowThreshold ? 1.5 : 0}
              fillOpacity={p.belowThreshold ? 1 : 0.85}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function CalibrationTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;

  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-ink">
        Predicted {point.bucket}–{point.bucket + BUCKET_WIDTH_PCT}%
      </p>
      <p className="tnum mt-1 text-ink-muted">
        Actual hit rate {percent(point.actualHitRate, 0)} · {point.n} predictions
      </p>
      {point.belowThreshold && (
        <p className="mt-1 text-ink-dim">Low sample size — read with caution.</p>
      )}
    </div>
  );
}
