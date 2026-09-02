"use client";

import Link from "next/link";
import { useSlip } from "@/lib/slip";
import { accumulator } from "@/lib/model/odds";
import { Badge, Button, ButtonLink, EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { kickoffTime, odds, percent, relativeDay } from "@/lib/format";
import { sportPath, matchPath } from "@/lib/routes";

export function SlipView() {
  const { legs, remove, clear, setBookmakerOdds } = useSlip();

  if (legs.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title="No selections yet"
        description="Add selections from any match page and this builds the true combined probability — plus what the combined pick is really worth against the price you have been offered."
        action={<ButtonLink href={sportPath("predictions")} variant="secondary">Browse predictions</ButtonLink>}
      />
    );
  }

  const priced = legs.map((l) => ({
    probability: l.probability,
    decimalOdds: l.bookmakerOdds && l.bookmakerOdds > 1 ? l.bookmakerOdds : l.fairOdds,
  }));
  const acc = accumulator(priced);
  const usingRealOdds = legs.some((l) => (l.bookmakerOdds ?? 0) > 1);

  // Legs from the same competition on the same day are not independent — a
  // weather or refereeing effect hits several at once — and the multiplication
  // below quietly assumes they are.
  const dayLeagueKeys = legs.map((l) => `${l.league}|${l.kickoff.slice(0, 10)}`);
  const correlated = new Set(dayLeagueKeys).size < dayLeagueKeys.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-3">
        {legs.map((l) => (
          <div key={l.matchId} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-dim">
                  {l.league} · {relativeDay(l.kickoff)} {kickoffTime(l.kickoff)}
                </p>
                <Link
                  href={matchPath(l.matchId)}
                  className="mt-1 block truncate text-sm font-semibold hover:text-brand"
                >
                  {l.fixture}
                </Link>
                <p className="mt-1.5 text-sm text-brand">{l.label}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(l.matchId)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-dim transition-colors hover:bg-surface-2 hover:text-rose"
                aria-label={`Remove ${l.fixture}`}
              >
                Remove
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 items-end gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-dim">Model</p>
                <p className="tnum mt-0.5 text-sm font-bold">{percent(l.probability)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-dim">Fair price</p>
                <p className="tnum mt-0.5 text-sm font-bold">{odds(l.fairOdds)}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-dim">
                  Your price
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={odds(l.fairOdds)}
                  value={l.bookmakerOdds ?? ""}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value.replace(",", "."));
                    setBookmakerOdds(l.matchId, Number.isFinite(n) && n > 1 ? n : undefined);
                  }}
                  className="tnum w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm font-semibold outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
                />
              </label>
            </div>
          </div>
        ))}

        <Button variant="secondary" onClick={clear} className="w-full py-2.5">
          Clear slip
        </Button>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-5 sm:p-7">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
            Combined pick
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-dim">
                Chance all {legs.length} land
              </p>
              <p className="tnum mt-1 font-display text-4xl font-extrabold text-brand">
                {percent(acc.probability, acc.probability < 0.1 ? 2 : 1)}
              </p>
              <div className="mt-3">
                <ProbabilityBar value={acc.probability} tone="brand" />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-dim">
                  {usingRealOdds ? "Your combined price" : "Fair combined price"}
                </dt>
                <dd className="tnum mt-0.5 text-lg font-bold">{odds(acc.decimalOdds)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-dim">
                  Expected return
                </dt>
                <dd
                  className={`tnum mt-0.5 text-lg font-bold ${
                    acc.expectedValue > 0 ? "text-brand" : "text-rose"
                  }`}
                >
                  {acc.expectedValue >= 0 ? "+" : ""}
                  {(acc.expectedValue * 100).toFixed(1)}%
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 space-y-3 border-t border-line pt-5">
            {!usingRealOdds && (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Priced at the model&apos;s fair price, so the expected return sits at zero by
                construction. Enter the actual prices you&apos;ve been offered above to see
                whether it&apos;s really worth taking.
              </p>
            )}

            {correlated && (
              <div className="rounded-lg border border-amber/25 bg-amber/5 p-3">
                <Badge tone="amber">Correlated legs</Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  Two or more of these are in the same competition on the same day. The maths here
                  assumes legs are independent, so the real chance of them all landing differs from
                  the number above.
                </p>
              </div>
            )}

            {legs.length >= 5 && (
              <div className="rounded-lg border border-rose/25 bg-rose/5 p-3">
                <Badge tone="rose">Long combo</Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  At {legs.length} legs this lands roughly {percent(acc.probability, 2)} of the
                  time. Long combined picks are where margin compounds hardest against you — the
                  payout looks big because it almost never pays.
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
