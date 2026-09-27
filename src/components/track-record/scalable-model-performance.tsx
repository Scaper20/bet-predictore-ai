import { Badge } from "@/components/ui/primitives";
import { percent } from "@/lib/format";
import type { ModelDescriptor } from "@/lib/model/registry";
import { MIN_PUBLISHABLE_SAMPLE, type SettledRecord } from "@/lib/performance";

/**
 * Model performance, from what actually settled.
 *
 * This replaces a hardcoded catalogue of three fictional models — including an
 * NBA engine for a sport the product does not cover — each carrying invented
 * accuracy, ROI and pick counts, under a subtitle claiming they were
 * "evaluated against real bookmaker odds". There are no bookmaker odds
 * anywhere in this product.
 *
 * The rule now: a model shows numbers only if it is `live` AND has cleared
 * MIN_PUBLISHABLE_SAMPLE graded picks. Everything else is a roadmap entry with
 * no statistics at all — which still communicates the multi-model direction,
 * without claiming a record for software that has not run.
 *
 * A server component: it renders data the page already resolved, and the sport
 * tab it replaces was filtering between one real card and one fictional one.
 */

export interface ModelPerformanceRow {
  model: ModelDescriptor;
  record: SettledRecord;
  /** Best-evidenced competition for this model — null unless it clears the floor. */
  topLeague: { name: string; winRate: number; sample: number } | null;
  /** Market families this model has actually graded picks in. */
  markets: { family: string; record: SettledRecord }[];
}

const MARKET_LABELS: Record<string, string> = {
  "1x2": "Match result",
  dc: "Double chance",
  ou: "Over / under",
  btts: "Both teams to score",
  cs: "Correct score",
  ah: "Asian handicap",
};

export function ScalableModelPerformance({ rows }: { rows: ModelPerformanceRow[] }) {
  const live = rows.filter((r) => r.model.status === "live");
  const roadmap = rows.filter((r) => r.model.status === "development");

  return (
    <section className="space-y-6">
      <div className="border-b border-line pb-3">
        <h2 className="font-display text-xl font-bold tracking-tight">Model performance</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Graded against final scores from the match feeds. Win rates exclude pushes, and no rate
          is shown until a model has {MIN_PUBLISHABLE_SAMPLE} settled picks.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {live.map((row) => (
          <LiveModelCard key={row.model.id} row={row} />
        ))}
      </div>

      {roadmap.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <h3 className="text-sm font-semibold">What we&apos;re building</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Specialised models for particular sports and particular kinds of pick. These
              haven&apos;t published anything yet, so they have no record to show — and we
              won&apos;t invent one.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roadmap.map(({ model }) => (
              <RoadmapModelCard key={model.id} model={model} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function LiveModelCard({ row }: { row: ModelPerformanceRow }) {
  const { model, record, topLeague, markets } = row;
  const publishable = record.sample >= MIN_PUBLISHABLE_SAMPLE;

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-ink">{model.brandName}</h3>
            <Badge tone="brand" className="text-[10px] uppercase">
              Live
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{model.blurb}</p>
        </div>
      </div>

      {publishable ? (
        <>
          <div className="grid grid-cols-3 gap-2 border-y border-line py-3 text-xs">
            <div>
              <span className="block text-ink-muted">Win rate</span>
              <span className="tnum font-mono text-base font-extrabold text-ink">
                {percent(record.winRate ?? 0)}
              </span>
            </div>
            <div>
              <span className="block text-ink-muted">Record</span>
              <span className="tnum font-mono text-base font-extrabold text-ink">
                {record.wins}–{record.losses}
                {record.pushes > 0 && (
                  <span className="text-ink-muted">–{record.pushes}</span>
                )}
              </span>
            </div>
            <div>
              <span className="block text-ink-muted">Graded picks</span>
              <span className="tnum font-mono text-base font-extrabold text-ink">
                {record.sample}
              </span>
            </div>
          </div>

          {markets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                By market
              </p>
              {markets.map(({ family, record: mr }) => (
                <div key={family} className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">{MARKET_LABELS[family] ?? family}</span>
                  <span className="tnum font-mono font-semibold">
                    {percent(mr.winRate ?? 0)}{" "}
                    <span className="font-normal text-ink-muted">({mr.sample})</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {topLeague && (
            <p className="border-t border-line pt-3 text-xs text-ink-muted">
              Strongest competition:{" "}
              <strong className="font-semibold text-ink">{topLeague.name}</strong>{" "}
              <span className="tnum">
                {percent(topLeague.winRate)} from {topLeague.sample}
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
          {record.sample === 0
            ? "No picks have settled yet."
            : `Only ${record.sample} settled ${record.sample === 1 ? "pick" : "picks"} so far.`}{" "}
          A win rate from a sample this small says more about the fixtures than the model, so
          there is nothing worth quoting until it reaches {MIN_PUBLISHABLE_SAMPLE}.
        </p>
      )}
    </div>
  );
}

function RoadmapModelCard({ model }: { model: ModelDescriptor }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-1/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-ink-muted">{model.brandName}</h4>
        <Badge tone="neutral" className="text-[10px] uppercase">
          In development
        </Badge>
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-ink-dim">
        {model.sportLabel}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{model.blurb}</p>
    </div>
  );
}
