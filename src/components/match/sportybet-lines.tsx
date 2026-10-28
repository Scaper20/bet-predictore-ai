import { odds, percent } from "@/lib/format";
import type { Prediction } from "@/lib/model/predict";
import { sportyBetLines } from "@/lib/sportybet-lines";

/**
 * Every extra line SportyBet lists on this game, with the model's chance and
 * the price it would need to pay: handicaps at every line, team goals,
 * corners, shots, shots on target and bookings. Streamed: it reads the stored
 * board and the count grids, both cached.
 */
export async function SportyBetLinesPanel({ prediction }: { prediction: Prediction }) {
  if (!prediction.sufficiency.publishable) return null;
  const groups = await sportyBetLines(prediction.match, prediction).catch(() => []);
  if (groups.length === 0) return null;

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">On SportyBet</h2>
        <span className="shrink-0 text-xs text-ink-dim">Our chance for each line they list</span>
      </div>
      <p className="mb-3 text-xs text-ink-dim">
        A refund on a whole line (or half on a quarter line) does not cut a code, so it counts in the chance.
      </p>
      <div className="space-y-3">
        {groups.map((g, i) => (
          <details key={g.key} className="group rounded-xl border border-line" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
              {g.title}
              <span className="text-xs font-normal text-ink-dim">{g.rows.length} lines</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {g.rows.map((r) => {
                const value = r.price !== null && Number.isFinite(r.fair) && r.price > r.fair * 1.02;
                return (
                  <li key={r.market} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{r.label}</span>
                    <span className="flex shrink-0 items-baseline gap-3 font-mono text-xs">
                      <span className="tnum font-semibold text-ink">{percent(r.probability)}</span>
                      {r.refund > 0.005 && <span className="text-ink-dim">{percent(r.refund)} refund</span>}
                      <span className={value ? "text-brand" : "text-ink-muted"} title={`Fair price ${odds(r.fair)}`}>
                        {r.price !== null ? odds(r.price) : "—"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

export function SportyBetLinesSkeleton() {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">On SportyBet</h2>
        <span className="shrink-0 text-xs text-ink-dim">Reading lines…</span>
      </div>
      <div className="h-[120px] animate-pulse rounded-xl bg-surface-2" aria-hidden />
    </section>
  );
}
