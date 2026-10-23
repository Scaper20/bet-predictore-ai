import type { Metadata } from "next";
import { getModelPerformance, type MarketBreakdown } from "@/lib/admin-analytics";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/ui/primitives";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pairedLogLoss, priceSkill, type PriceSkill, type PricedOutcome } from "@/lib/odds/price-skill";

export const metadata: Metadata = { title: "Model performance" };

export default async function ModelPerformancePage() {
  const [perf, shadow, prices] = await Promise.all([getModelPerformance(), getShadowRecord(), getPriceRecord()]);
  const totalSettled = perf.overall.wins + perf.overall.losses + perf.overall.pushes;

  if (totalSettled === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">Model performance</h1>
        <EmptyState
          icon="📊"
          title="No settled picks yet"
          description="Once predictions_log has settled rows (the daily cron logs and grades headline picks automatically), performance breakdowns will show up here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-bold">Model performance</h1>

      <PricesSection data={prices} />

      <ShadowSection rows={shadow.filter((r) => r.reason !== "market-total")} />

      <section className="grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Overall win rate"
          value={perf.overall.winRate !== null ? `${Math.round(perf.overall.winRate * 100)}%` : "—"}
        />
        <StatCard label="Wins" value={perf.overall.wins.toLocaleString()} />
        <StatCard label="Losses" value={perf.overall.losses.toLocaleString()} />
        <StatCard label="Pushes" value={perf.overall.pushes.toLocaleString()} />
      </section>

      <BreakdownSection title="By market" data={perf.byMarket} />
      <BreakdownSection title="By league" data={perf.byLeague} />

      <section className="card p-5 sm:p-6">
        <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Calibration
        </h2>
        <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-dim">
          Are picks published around a given confidence actually winning that often? Predicted is
          the average probability the model assigned; actual is the real win rate observed. Not
          shown publicly — this is a model-honesty check, not a marketing claim.
        </p>
        {perf.calibration.length === 0 ? (
          <p className="text-sm text-ink-dim">Not enough settled picks yet to bucket.</p>
        ) : (
          <div className="space-y-3">
            {perf.calibration.map((c) => (
              <div key={c.bucket} className="grid grid-cols-[3.5rem_1fr_1fr_4rem] items-center gap-3">
                <span className="tnum text-xs font-semibold text-ink-muted">{c.bucket}</span>
                <CalibrationBar label="Predicted" value={c.predictedAvg} tone="cyan" />
                <CalibrationBar label="Actual" value={c.actualWinRate} tone="brand" />
                <span className="tnum text-right text-xs text-ink-dim">n={c.sampleSize}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface ShadowRow {
  market: string;
  label: string;
  reason: string;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  stated: number;
}

/** Shadow picks (lib/model/shadow.ts) grouped by selection. */
async function getShadowRecord(): Promise<ShadowRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from("shadow_picks")
      .select("market, label, reason, probability, result")
      .neq("reason", "market-total")
      .order("kickoff", { ascending: false })
      .limit(5000);
    const by = new Map<string, ShadowRow & { sum: number }>();
    for (const r of data ?? []) {
      const key = r.market as string;
      const row = by.get(key) ?? {
        market: key, label: r.label as string, reason: r.reason as string,
        graded: 0, wins: 0, losses: 0, pushes: 0, pending: 0, stated: 0, sum: 0,
      };
      if (r.result === null) row.pending++;
      else {
        row.graded++;
        row.sum += Number(r.probability);
        if (r.result === "win") row.wins++;
        else if (r.result === "lose") row.losses++;
        else row.pushes++;
      }
      by.set(key, row);
    }
    return [...by.values()]
      .map(({ sum, ...r }) => ({ ...r, stated: r.graded ? sum / r.graded : 0 }))
      .sort((a, b) => (a.reason === b.reason ? b.graded + b.pending - (a.graded + a.pending) : a.reason < b.reason ? 1 : -1));
  } catch {
    return [];
  }
}

interface PriceRecord {
  skill: PriceSkill;
  /** Published picks SportyBet rated 8 points or more below us: the Code Hub safety filter, measured. */
  doubted: { n: number; landed: number; stated: number } | null;
  /** Market-informed totals against the model's own chance, same selections. */
  marketTotal: { n: number; a: number; b: number } | null;
  marketTotalPending: number;
}

const DOUBT_GAP = 0.08;

async function getPriceRecord(): Promise<PriceRecord> {
  const empty: PriceRecord = { skill: { clv: null, forecasts: null }, doubted: null, marketTotal: null, marketTotalPending: 0 };
  try {
    const db = supabaseAdmin();
    const [{ data: picks }, { data: shadow }] = await Promise.all([
      db
        .from("predictions_log")
        .select("probability, market_prob_at_publish, price_at_publish, closing_price, result")
        .not("market_prob_at_publish", "is", null)
        .order("kickoff", { ascending: false })
        .limit(5000),
      db
        .from("shadow_picks")
        .select("probability, model_probability, result")
        .eq("reason", "market-total")
        .order("kickoff", { ascending: false })
        .limit(5000),
    ]);
    const rows: PricedOutcome[] = (picks ?? []).map((r) => ({
      probability: Number(r.probability),
      marketProbability: r.market_prob_at_publish === null ? null : Number(r.market_prob_at_publish),
      priceAtPublish: r.price_at_publish === null ? null : Number(r.price_at_publish),
      closingPrice: r.closing_price === null ? null : Number(r.closing_price),
      result: r.result as PricedOutcome["result"],
    }));
    const doubtedRows = rows.filter(
      (r) => r.marketProbability !== null && r.probability - r.marketProbability >= DOUBT_GAP && (r.result === "win" || r.result === "lose"),
    );
    const settled = (shadow ?? []).filter((r) => (r.result === "win" || r.result === "lose") && r.model_probability !== null);
    return {
      skill: priceSkill(rows),
      doubted: doubtedRows.length
        ? {
            n: doubtedRows.length,
            landed: doubtedRows.filter((r) => r.result === "win").length / doubtedRows.length,
            stated: doubtedRows.reduce((s, r) => s + r.probability, 0) / doubtedRows.length,
          }
        : null,
      marketTotal: pairedLogLoss(
        settled.map((r) => ({ a: Number(r.probability), b: Number(r.model_probability), won: r.result === "win" })),
      ),
      marketTotalPending: (shadow ?? []).filter((r) => r.result === null).length,
    };
  } catch {
    return empty;
  }
}

const MARKET_TOTAL_MIN = 200;

function PricesSection({ data }: { data: PriceRecord }) {
  const { clv, forecasts } = data.skill;
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const mt = data.marketTotal;
  const ready = mt && mt.n >= MARKET_TOTAL_MIN;
  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Against SportyBet&rsquo;s prices</h2>
        <p className="max-w-2xl text-xs leading-relaxed text-ink-dim">
          Every pick logged since price recording began carries SportyBet&rsquo;s price at publish and at kick-off. Nothing here changes a
          published pick: it is the evidence for when prices should.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Beat the closing price" value={clv ? pct(clv.beatClose) : "—"} />
        <StatCard label="Average closing line value" value={clv ? `${clv.average >= 0 ? "+" : ""}${pct(clv.average)}` : "—"} />
        <StatCard label="Picks with both prices" value={clv ? clv.n.toLocaleString() : "0"} />
      </div>

      {forecasts ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="text-ink-dim">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Forecast, {forecasts.n} decided picks</th>
                <th className="py-2 pr-3 text-right font-medium">Brier</th>
                <th className="py-2 text-right font-medium">Log loss</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {(
                [
                  ["The model", forecasts.model],
                  ["SportyBet, margin removed", forecasts.market],
                  ["Half and half", forecasts.blend],
                ] as const
              ).map(([label, s]) => {
                const best = Math.min(forecasts.model.logLoss, forecasts.market.logLoss, forecasts.blend.logLoss) === s.logLoss;
                return (
                  <tr key={label} className="border-b border-line/60">
                    <td className={`py-2 pr-3 font-semibold ${best ? "text-brand" : "text-ink"}`}>{label}</td>
                    <td className="py-2 pr-3 text-right">{s.brier.toFixed(4)}</td>
                    <td className="py-2 text-right">{s.logLoss.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-dim">Lower is better. If the blend keeps winning, the prices know something the model doesn&rsquo;t.</p>
        </div>
      ) : (
        <p className="text-sm text-ink-dim">No priced pick has settled yet. Prices are recorded from the hourly sync in production.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4 text-xs">
          <p className="font-semibold text-ink">When SportyBet doubts us by {Math.round(DOUBT_GAP * 100)} points or more</p>
          <p className="mt-1 text-ink-dim">
            {data.doubted
              ? `${data.doubted.n} picks: landed ${pct(data.doubted.landed)} against a stated ${pct(data.doubted.stated)}. If they keep landing short, the Code Hub should leave such picks out.`
              : "None settled yet."}
          </p>
        </div>
        <div className="rounded-xl border border-line p-4 text-xs">
          <p className="font-semibold text-ink">Market-informed totals (over/under 1.5 and 3.5)</p>
          <p className="mt-1 text-ink-dim">
            {mt
              ? `${mt.n} graded: log loss ${mt.a.toFixed(4)} with the market's total against ${mt.b.toFixed(4)} for the model alone. `
              : "None graded yet. "}
            {data.marketTotalPending} waiting.{" "}
            {ready
              ? mt.a < mt.b
                ? "The market's total is ahead: worth using in published goals picks."
                : "The model alone is ahead: leave it off."
              : `A call needs ${MARKET_TOTAL_MIN} graded.`}
          </p>
        </div>
      </div>
    </section>
  );
}

function ShadowSection({ rows }: { rows: ShadowRow[] }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">
        Watched, not published
      </h2>
      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-ink-dim">
        Paused handicaps (a goal or more) and GG/NG, logged before kick-off and graded like real picks. A line earns its
        way back when its landed rate holds at or above its stated chance over about 200 graded picks.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-dim">Nothing logged yet. The next daily run starts the record.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-ink-dim">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Selection</th>
                <th className="py-2 pr-3 text-right font-medium">Graded</th>
                <th className="py-2 pr-3 text-right font-medium">W-L-P</th>
                <th className="py-2 pr-3 text-right font-medium">Landed</th>
                <th className="py-2 pr-3 text-right font-medium">Stated</th>
                <th className="py-2 text-right font-medium">Pending</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {rows.map((r) => {
                const decided = r.wins + r.losses;
                const landed = decided ? r.wins / decided : null;
                const short = landed !== null && decided >= 20 && landed < r.stated - 0.03;
                return (
                  <tr key={r.market} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold text-ink">{r.label}</td>
                    <td className="py-2 pr-3 text-right">{r.graded}</td>
                    <td className="py-2 pr-3 text-right text-ink-muted">{r.wins}-{r.losses}-{r.pushes}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${short ? "text-rose" : "text-ink"}`}>
                      {landed !== null ? `${Math.round(landed * 100)}%` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-muted">{r.graded ? `${Math.round(r.stated * 100)}%` : "—"}</td>
                    <td className="py-2 text-right text-ink-dim">{r.pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BreakdownSection({ title, data }: { title: string; data: Record<string, MarketBreakdown> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => (b.winRate ?? 0) - (a.winRate ?? 0));
  if (entries.length === 0) return null;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-5 font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      <div className="space-y-3">
        {entries.map(([key, breakdown]) => {
          const pct = breakdown.winRate ?? 0;
          return (
            <div key={key} className="grid grid-cols-[1fr_2fr_3rem] items-center gap-3">
              <span className="truncate text-xs text-ink-muted">{key}</span>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct * 100}%` }} />
              </div>
              <span className="tnum text-right text-xs font-semibold">
                {breakdown.winRate !== null ? `${Math.round(pct * 100)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CalibrationBar({ label, value, tone }: { label: string; value: number; tone: "cyan" | "brand" }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-ink-dim">{label}</span>
        <span className="tnum text-[10px] font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${tone === "cyan" ? "bg-cyan" : "bg-brand"}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
