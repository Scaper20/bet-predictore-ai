import { percent } from "@/lib/format";

/**
 * Chances in words. A bare "78%" asks the reader to do the maths; "Very
 * likely, 8 in 10" answers the question the market asks. The exact figure
 * stays alongside, small, for people who want it.
 */

export interface Likelihood {
  word: string;
  /** Classes for the word's chip. */
  tone: string;
}

export function likelihood(p: number): Likelihood {
  // From the same rounding as inTen, so "6 in 10" always reads the same word.
  const n = Math.round(p * 10);
  if (n >= 8) return { word: "Very likely", tone: "bg-brand text-brand-ink" };
  if (n >= 6) return { word: "Likely", tone: "bg-brand/15 text-brand" };
  if (n === 5) return { word: "Either way", tone: "bg-surface-3 text-ink" };
  if (n >= 3) return { word: "Unlikely", tone: "bg-surface-2 text-ink-muted" };
  return { word: "Long shot", tone: "bg-surface-2 text-ink-dim" };
}

/** "1 in 8": for small chances, where "1 in 10" would blur them together. */
export function oneIn(p: number): string {
  if (p <= 0) return "—";
  return `1 in ${Math.max(1, Math.round(1 / p))}`;
}

/** "8 in 10", rounded to the nearest whole game in ten. */
export function inTen(p: number): string {
  const n = Math.round(p * 10);
  if (n < 1) return "under 1 in 10";
  if (n > 9) return "9+ in 10";
  return `${n} in 10`;
}

export function Chip({ p }: { p: number }) {
  const l = likelihood(p);
  return <span className={`inline-flex w-[5.5rem] shrink-0 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.tone}`}>{l.word}</span>;
}

/**
 * One market as a question and its answer, on one line: the chance and the
 * word for it. The market's own name sits under the question, small.
 */
export function Ask({ q, sub, p }: { q: string; sub?: string; p: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <p className="min-w-0 text-sm leading-snug text-ink">
        {q}
        {sub && <span className="block text-[10.5px] leading-tight text-ink-dim">{sub}</span>}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tnum w-10 text-right font-mono text-sm font-semibold text-ink" title={inTen(p)}>
          {percent(p)}
        </span>
        <Chip p={p} />
      </div>
    </div>
  );
}

export function AskList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

/** Three outcomes side by side, the likeliest picked out when it clearly is. */
export function Pick3({ items }: { items: { label: string; p: number }[] }) {
  const best = Math.max(...items.map((i) => i.p));
  // Two that both read "4 in 10" are too close to crown either.
  const clear = items.filter((i) => inTen(i.p) === inTen(best)).length === 1;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((i) => {
        const top = clear && i.p === best;
        return (
          <div key={i.label} className={`min-w-0 rounded-lg px-2 py-2.5 text-center ${top ? "bg-brand/10 ring-1 ring-brand/40" : "bg-surface-2"}`}>
            <p className={`tnum text-base font-bold ${top ? "text-brand" : ""}`}>{inTen(i.p)}</p>
            <p className="mt-0.5 truncate text-[11px] text-ink-dim" title={`${i.label}: ${percent(i.p)}`}>
              {i.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** How many goals (or corners): one bar per total, the likeliest lit. */
export function CountChart({ bars, noun }: { bars: { label: string; p: number }[]; noun: string }) {
  const top = Math.max(...bars.map((b) => b.p));
  const best = bars.find((b) => b.p === top)!;
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">
        {bars.map((b) => (
          <div key={b.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${b.label} ${noun}: ${percent(b.p)}`}>
            <div className={`rounded-t-md ${b.p === top ? "bg-brand" : "bg-surface-3"}`} style={{ height: `${Math.max(4, (b.p / top) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {bars.map((b) => (
          <span key={b.label} className={`tnum min-w-0 flex-1 text-center text-[11px] ${b.p === top ? "font-semibold text-brand" : "text-ink-dim"}`}>
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Most likely: <span className="font-semibold text-ink">{best.label} {noun}</span> ({inTen(best.p)})
      </p>
    </div>
  );
}

/** Secondary markets, folded away until asked for. */
export function More({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-lg border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-ink-muted [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-ink-dim transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-3 pt-1">{children}</div>
    </details>
  );
}
