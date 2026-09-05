"use client";

import { useMemo, useState } from "react";
import type { Prediction } from "@/lib/model/predict";
import { assessAgainstMarket, overround } from "@/lib/model/odds";
import { odds as fmtOdds, percent } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";

/**
 * Compares the model against a reference price the user provides.
 *
 * The margin has to come out before any comparison means anything: a book
 * pricing 1X2 at 2.10/3.40/3.60 is holding about 6%, so a "value" call made
 * against the raw implied probabilities would fire on bets that are really
 * break-even at best. All three prices are taken so the overround can be
 * measured and removed.
 */
export function ValueCalculator({ prediction }: { prediction: Prediction }) {
  const { markets: m, match } = prediction;
  const [input, setInput] = useState({ home: "", draw: "", away: "" });

  const parsed = useMemo(
    () => ({
      home: parseOdds(input.home),
      draw: parseOdds(input.draw),
      away: parseOdds(input.away),
    }),
    [input],
  );

  const complete = parsed.home > 1 && parsed.draw > 1 && parsed.away > 1;
  const market = complete ? [parsed.home, parsed.draw, parsed.away] : undefined;
  const margin = complete ? overround(market!) - 1 : 0;

  const rows = [
    { key: "home", label: match.home.name, probability: m.home, price: parsed.home },
    { key: "draw", label: "Draw", probability: m.draw, price: parsed.draw },
    { key: "away", label: match.away.name, probability: m.away, price: parsed.away },
  ] as const;

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Value finder
        </h2>
        <span className="shrink-0 text-xs text-ink-dim">Reference price</span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ink-dim">
        Enter all three prices you&apos;ve been offered. We strip the margin, then compare what is
        left against the model&apos;s own probability.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <label key={r.key} className="block">
            <span className="mb-1.5 block truncate text-[11px] font-medium text-ink-muted">
              {r.label}
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={input[r.key]}
              onChange={(e) => setInput((v) => ({ ...v, [r.key]: e.target.value }))}
              className="tnum w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
              aria-label={`${r.label} decimal odds`}
            />
          </label>
        ))}
      </div>

      {complete ? (
        <div className="mt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone={margin > 0.08 ? "rose" : margin > 0.05 ? "amber" : "brand"}>
              {percent(margin, 1)} margin
            </Badge>
            <span className="text-[11px] text-ink-dim">
              {margin > 0.08
                ? "That is a heavy margin — shop around before acting on it."
                : margin > 0.05
                  ? "A fairly typical margin for this market."
                  : "A sharp price. Worth taking seriously."}
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((r) => {
              const v = assessAgainstMarket(r.probability, r.price, market);
              return (
                <div
                  key={r.key}
                  className={`rounded-xl border p-4 ${
                    v.isValue ? "border-brand/35 bg-brand/[0.06]" : "border-line bg-surface-2"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.label}</span>
                    {v.isValue ? (
                      <Badge tone="brand">Value · +{(v.edge * 100).toFixed(1)}pts</Badge>
                    ) : (
                      <Badge tone="neutral">{(v.edge * 100).toFixed(1)}pts edge</Badge>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Cell label="Model says" value={percent(v.modelProbability, 1)} />
                    {/* The market's own probability with the margin taken out —
                        not a price, and not ours. It was labelled "Fair price"
                        while rendering a percentage, which made the one row
                        that compares us to the book unreadable. */}
                    <Cell label="Market says" value={percent(v.fairProbability, 1)} />
                    <Cell
                      label="Expected value"
                      value={`${v.expectedValue >= 0 ? "+" : ""}${(v.expectedValue * 100).toFixed(1)}%`}
                      tone={v.expectedValue > 0 ? "brand" : "muted"}
                    />
                    <Cell
                      label="Suggested allocation"
                      value={v.kellyStake > 0 ? `${(v.kellyStake * 100).toFixed(1)}% bank` : "Skip"}
                      tone={v.kellyStake > 0 ? "brand" : "muted"}
                    />
                  </dl>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-ink-dim">
            Allocations are quarter-Kelly and capped at 5% of bankroll. Even a genuine edge loses
            often — Kelly is a long-run bankroll rule, not a promise about this match.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-dim">
          Enter all three prices to see where the model disagrees with the price you were offered.
        </p>
      )}
    </section>
  );
}

function Cell({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "brand" | "muted";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className={`tnum mt-0.5 text-sm font-bold ${tone === "brand" ? "text-brand" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}

function parseOdds(raw: string): number {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export { fmtOdds };
