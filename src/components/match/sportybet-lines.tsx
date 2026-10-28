import { odds, percent } from "@/lib/format";
import type { Prediction } from "@/lib/model/predict";
import { sportyBetLines } from "@/lib/sportybet-lines";
import { lineTables, type LineCell, type LineTable } from "@/lib/line-tables";
import { ChipTabs } from "@/components/ui/chip-tabs";

/**
 * Every extra line SportyBet lists on this game, as one small table per
 * question: a row per line, the sides of it next to each other, each with
 * our chance of it winning and SportyBet's odds. A market group at a time
 * (handicaps, team goals, corners, shots, bookings). Streamed: it reads the
 * stored board and the count grids, both cached.
 */
export async function SportyBetLinesPanel({ prediction }: { prediction: Prediction }) {
  if (!prediction.sufficiency.publishable) return null;
  const groups = await sportyBetLines(prediction.match, prediction).catch(() => []);
  const { home, away } = prediction.match;
  const tabs = groups
    .map((g) => ({ g, tables: lineTables(g.rows, home.shortName, away.shortName) }))
    .filter((x) => x.tables.length > 0);
  if (tabs.length === 0) {
    return (
      <section className="card p-4 sm:p-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">On SportyBet</h2>
        <p className="mt-2 text-sm text-ink-dim">SportyBet hasn&apos;t listed extra lines for this game yet. Check back closer to kick-off.</p>
      </section>
    );
  }

  return <SportyBetLinesView tabs={tabs.map(({ g, tables }) => ({ key: g.key, title: g.title, tables }))} />;
}

/** The panel itself, from tables already built: one segmented tab per market group. */
export function SportyBetLinesView({ tabs }: { tabs: { key: string; title: string; tables: LineTable[] }[] }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">On SportyBet</h2>
        <Legend />
      </div>
      <ChipTabs
        ariaLabel="SportyBet markets"
        variant="segmented"
        sections={tabs.map(({ key, title, tables }) => ({
          key,
          label: title.replace(/ \(.*\)$/, ""),
          node: (
            <div className="grid gap-3 lg:grid-cols-2">
              {tables.map((t) => (
                <Table key={t.key} t={t} />
              ))}
            </div>
          ),
        }))}
      />
    </section>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-dim">
      <span>
        <span className="font-mono font-semibold text-ink">62%</span> our chance it wins
      </span>
      <span>
        <span className="font-mono text-ink-muted">1.85</span> SportyBet odds
      </span>
      <span>
        <span className="font-mono font-semibold text-brand">1.85 ●</span> pays more than it should
      </span>
      <span>
        <span className="font-mono">↺ 20%</span> stake back
      </span>
    </p>
  );
}

function Table({ t }: { t: LineTable }) {
  const one = t.rows.length === 1 && t.rows[0].line === "";
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <p className="border-b border-line bg-surface-2/60 px-3 py-2 text-xs font-semibold text-ink">{t.title}</p>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-ink-dim">
            {!one && <th className="w-[28%] px-3 py-1.5 text-left font-medium normal-case tracking-normal">{t.lineLabel}</th>}
            {t.sides.map((s) => (
              <th key={s} className="truncate px-2 py-1.5 text-right font-medium normal-case tracking-normal" title={s}>
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => {
            const best = Math.max(...r.cells.map((c) => c?.win ?? 0));
            return (
              <tr key={r.line || "only"} className="border-t border-line/70">
                {!one && <td className="px-3 py-2 font-mono text-xs font-semibold text-ink-muted">{r.line}</td>}
                {r.cells.map((c, i) => (
                  <td key={i} className="px-2 py-2 text-right">
                    {c ? <Cell c={c} lead={c.win === best && best > 0} /> : <span className="text-ink-dim">—</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ c, lead }: { c: LineCell; lead: boolean }) {
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={`tnum font-mono text-sm ${lead ? "font-semibold text-ink" : "text-ink-muted"}`}>{percent(c.win)}</span>
      <span className="tnum flex items-baseline gap-1.5 font-mono text-[11px]">
        {c.refund > 0.005 && (
          <span className="text-ink-dim" title={`${percent(c.refund)} chance the stake (or half) comes back`}>
            ↺{percent(c.refund)}
          </span>
        )}
        <span className={c.value ? "font-semibold text-brand" : "text-ink-dim"} title={c.value ? "SportyBet pays more than our numbers say it should" : undefined}>
          {c.price !== null ? odds(c.price) : "—"}
          {c.value && " ●"}
        </span>
      </span>
    </span>
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
