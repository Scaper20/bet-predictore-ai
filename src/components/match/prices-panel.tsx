import { Badge } from "@/components/ui/primitives";
import { odds } from "@/lib/format";
import { LOCAL_BOOK, priceSelections, type SelectionPricing } from "@/lib/odds";
import { isQuotable } from "@/lib/odds/markets";
import type { Prediction } from "@/lib/model/predict";
import type { PriceRating } from "@/lib/odds/consensus";

/**
 * What the user is actually being offered, and whether that is a good price.
 *
 * Every other panel on this page describes the match. This one describes the
 * bet, and it is the only place on the site where a number the user did not
 * type in comes from a bookmaker rather than from the model.
 *
 * The comparison it makes is deliberately not "is this +EV against our
 * model" -- the backtest put the model roughly level with the market, so that
 * question has no honest answer here. It is "is this a good price compared to
 * what everyone else is offering", which twenty-five books answer between them
 * and which varies enough between selections to be worth reading.
 */

/** How many selections to price. The ranked list is already the useful order. */
const MAX_ROWS = 6;

const TONES: Record<PriceRating, { tone: "brand" | "neutral" | "amber" | "rose"; label: string }> = {
  value: { tone: "brand", label: "Value" },
  best: { tone: "brand", label: "Best price" },
  competitive: { tone: "neutral", label: "Competitive" },
  short: { tone: "amber", label: "Short" },
  poor: { tone: "rose", label: "Poor price" },
};

export async function PricesPanel({ prediction }: { prediction: Prediction }) {
  const { match, picks, sufficiency } = prediction;
  if (!sufficiency.publishable) return null;

  const wanted = picks.filter((p) => isQuotable(p.market)).slice(0, MAX_ROWS);
  if (wanted.length === 0) return null;

  const rows = await priceSelections(match, wanted).catch(() => []);
  const priced = rows.filter((r) => r.local !== null || r.consensus !== null);

  // Nothing from either provider is not an error state worth a card: the
  // fixture simply is not listed, which is routine outside the big leagues.
  if (priced.length === 0) return null;

  const anyLocal = priced.some((r) => r.local !== null);
  const anyConsensus = priced.some((r) => r.consensus !== null);

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          What you are offered
        </h2>
        <span className="shrink-0 text-xs text-ink-dim">
          {anyLocal ? LOCAL_BOOK : "Market only"}
        </span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ink-dim">
        {anyConsensus
          ? `Live ${LOCAL_BOOK} prices, rated against what the rest of the market is offering on ` +
            "the same selection right now."
          : `Live ${LOCAL_BOOK} prices. No other book covers this competition, so these are ` +
            "rated against the model's own break-even instead."}
      </p>

      <div className="space-y-3">
        {priced.map((row) => (
          <PriceRow key={row.market} row={row} />
        ))}
      </div>

      <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-dim">
        {anyConsensus ? (
          <>
            Every bookmaker&apos;s price sits below fair value — that gap is how they make
            money, and it is why these are rated against each other rather than against
            zero. Prices move; check before you stake.
          </>
        ) : (
          <>
            Break-even is what the selection is worth with no margin attached. A price below
            it loses money over time however often the bet lands.
          </>
        )}
      </p>
    </section>
  );
}

function PriceRow({ row }: { row: SelectionPricing }) {
  const verdict = row.priceVerdict;
  const tone = verdict ? TONES[verdict.rating] : null;

  // The reason line is worth the space on the extremes and is noise in the
  // middle: five identical "a normal price" sentences teach a reader to skip
  // the panel.
  const explain =
    verdict && (verdict.rating === "value" || verdict.rating === "poor")
      ? verdict.reason
      : row.modelVerdict?.reason;

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.label}</span>
        <span className="flex shrink-0 items-baseline gap-3">
          {row.local !== null ? (
            <span className="tnum font-display text-xl font-extrabold">{odds(row.local)}</span>
          ) : (
            <span className="text-xs text-ink-dim">Not listed</span>
          )}
          {tone && <Badge tone={tone.tone}>{tone.label}</Badge>}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-ink-dim">
        {row.consensus ? (
          <>
            <span>
              Market{" "}
              <span className="tnum font-semibold text-ink-muted">
                {odds(1 / row.consensus.fairProbability)}
              </span>{" "}
              <span className="text-ink-dim">({row.consensus.books} books)</span>
            </span>
            <span>
              Best{" "}
              <span className="tnum font-semibold text-ink-muted">
                {odds(row.consensus.best.price)}
              </span>
            </span>
            {row.consensus.sharp && (
              <span>
                Pinnacle{" "}
                <span className="tnum font-semibold text-ink-muted">
                  {odds(row.consensus.sharp.price)}
                </span>
              </span>
            )}
          </>
        ) : (
          <span>
            Break-even{" "}
            <span className="tnum font-semibold text-ink-muted">{odds(row.breakEven)}</span>
          </span>
        )}
      </div>

      {explain && <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">{explain}</p>}
    </div>
  );
}

/** Shown while the two providers are being read. */
export function PricesPanelSkeleton() {
  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          What you are offered
        </h2>
        <span className="shrink-0 text-xs text-ink-dim">Reading prices…</span>
      </div>
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
