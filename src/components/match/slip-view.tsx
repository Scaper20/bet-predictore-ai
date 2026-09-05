"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { legTeams, useSlip, type SlipLeg } from "@/lib/slip";
import { accumulator } from "@/lib/model/odds";
import { Badge, Button, ButtonLink, EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { kickoffTime, odds, percent, relativeDay } from "@/lib/format";
import { sportPath, matchPath } from "@/lib/routes";
import { assessValue, worstLeg, type ValueVerdict } from "@/lib/value";

/** One selection's live prices, as /api/odds returns them. */
interface LivePrice {
  key: string;
  price: number | null;
  rating: "value" | "best" | "competitive" | "short" | "poor" | null;
  reason: string | null;
  marketPrice: number | null;
  best: number | null;
  books: number | null;
}

const RATINGS: Record<
  NonNullable<LivePrice["rating"]>,
  { tone: "brand" | "neutral" | "amber" | "rose"; label: string }
> = {
  value: { tone: "brand", label: "Value" },
  best: { tone: "brand", label: "Best price" },
  competitive: { tone: "neutral", label: "Competitive" },
  short: { tone: "amber", label: "Short" },
  poor: { tone: "rose", label: "Poor price" },
};

const legKey = (leg: SlipLeg) => `${leg.matchId}|${leg.market}`;

/**
 * Fetch what each leg is actually being offered at, and fill the blanks.
 *
 * The slip is the one surface where the user was previously asked to type
 * every price by hand, which is both the reason most people never saw a
 * verdict and the reason the ones who did were comparing against whatever
 * they happened to remember. Filling it from the board they will actually bet
 * into is the difference between a calculator and an answer.
 *
 * Prices the user typed are never touched -- see applyFetchedOdds.
 */
const NO_PRICES: Map<string, LivePrice> = new Map();

function useLivePrices(legs: SlipLeg[], applyFetchedOdds: (prices: Map<string, number>) => void) {
  /*
   * One piece of state, stamped with the selection set it belongs to, and
   * written only from the fetch's own callbacks. The obvious shape -- a
   * `prices` map beside a `loading` flag, both set at the top of the effect --
   * both trips React's cascading-render rule and leaves the previous slip's
   * prices on screen for a frame after the selections change. Deriving both
   * from the stamp fixes the second problem as a consequence of fixing the
   * first.
   */
  const [result, setResult] = useState<{
    signature: string;
    prices: Map<string, LivePrice>;
    status: "done" | "unavailable";
  } | null>(null);

  // Refetch when the SELECTIONS change, not on every render: the legs array is
  // rebuilt whenever a price is edited, and depending on it directly would
  // make each keystroke in the price field fire a request.
  const signature = legs.map(legKey).sort().join(",");

  useEffect(() => {
    // An empty slip renders its own empty state and never reads either value,
    // so there is nothing to clear and nothing to fetch.
    if (signature === "") return;

    const payload = legs.flatMap((leg) => {
      const teams = legTeams(leg);
      if (!teams) return [];
      return [
        {
          matchId: leg.matchId,
          homeName: teams.homeName,
          awayName: teams.awayName,
          kickoff: leg.kickoff,
          league: leg.league,
          market: leg.market,
          label: leg.label,
          probability: leg.probability,
          fairOdds: leg.fairOdds,
        },
      ];
    });

    const controller = new AbortController();

    fetch("/api/odds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legs: payload }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { prices?: LivePrice[] }) => {
        const rows = body.prices ?? [];
        setResult({
          signature,
          prices: new Map(rows.map((row) => [row.key, row])),
          status: "done",
        });

        const fetched = new Map<string, number>();
        for (const row of rows) {
          const matchId = row.key.split("|")[0];
          if (row.price !== null && matchId) fetched.set(matchId, row.price);
        }
        if (fetched.size > 0) applyFetchedOdds(fetched);
      })
      .catch((err: unknown) => {
        // An aborted request is this effect being superseded, not a failure.
        if (err instanceof Error && err.name === "AbortError") return;
        // Signed out, rate limited, offline: all mean "no live price", which
        // the slip already renders as the hand-entry it has always been.
        setResult({ signature, prices: NO_PRICES, status: "unavailable" });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const current = result?.signature === signature ? result : null;
  return {
    prices: current?.prices ?? NO_PRICES,
    state: signature === "" ? "idle" : (current?.status ?? "loading"),
  } as const;
}

/**
 * What one leg's price is worth, once the user has entered one.
 *
 * Renders nothing without a price. Break-even is the model's fair odds under a
 * name that says what to do with it: "fair price" reads as a fact about the
 * selection, and worse, as a reassurance that the deal is a fair one. A
 * threshold reads as a threshold.
 */
function LegVerdict({
  verdict,
  breakEven,
  live,
}: {
  verdict: ValueVerdict | null;
  breakEven: number;
  live: LivePrice | undefined;
}) {
  /*
   * Where the market has an opinion it outranks ours. Twenty-five books
   * disagreeing about a price is a fact about the price; our model disagreeing
   * with it is a claim that has to earn its place, and the backtest put the
   * model roughly level with the market rather than ahead of it.
   */
  if (live?.rating && live.marketPrice !== null) {
    const tone = RATINGS[live.rating];
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone={tone.tone}>{tone.label}</Badge>
          <span className="tnum text-[11px] text-ink-dim">
            Market <span className="font-semibold text-ink-muted">{odds(live.marketPrice)}</span>
            {live.best !== null && (
              <>
                {" · "}Best <span className="font-semibold text-ink-muted">{odds(live.best)}</span>
              </>
            )}
            {live.books !== null && <> {" · "}{live.books} books</>}
          </span>
        </div>
        {live.reason && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{live.reason}</p>
        )}
      </div>
    );
  }

  if (!verdict) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-[11px] text-ink-dim">
        Enter your bookmaker&apos;s price to see whether it beats the{" "}
        <span className="tnum font-semibold text-ink-muted">{odds(breakEven)}</span> this needs.
      </p>
    );
  }

  const tone =
    verdict.rating === "no-bet"
      ? { text: "text-rose", badge: "rose" as const, label: "Don't take it" }
      : verdict.rating === "thin"
        ? { text: "text-ink-muted", badge: "neutral" as const, label: "Thin" }
        : { text: "text-brand", badge: "brand" as const, label: "Value" };

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone.badge}>{tone.label}</Badge>
        <span className={`tnum text-xs font-bold ${tone.text}`}>
          {verdict.edge >= 0 ? "+" : ""}
          {(verdict.edge * 100).toFixed(1)}% per ₦100
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{verdict.reason}</p>
    </div>
  );
}

export function SlipView() {
  const { legs, remove, clear, setBookmakerOdds, applyFetchedOdds } = useSlip();
  const { prices, state } = useLivePrices(legs, applyFetchedOdds);
  const fetchedAny = useMemo(
    () => legs.some((l) => l.oddsSource === "sportybet"),
    [legs],
  );

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

  /*
   * The combined return averages the legs, and averages are how a bad price
   * survives: one leg at 1.15 against a 1.25 break-even and one genuinely long
   * leg net out to something unremarkable, and the user takes both. This
   * surfaces the worst one by name.
   */
  const worst = worstLeg(legs, (l) => ({
    probability: l.probability,
    price: l.bookmakerOdds,
  }));

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
                <p className="text-[10px] uppercase tracking-wider text-ink-dim">Break-even</p>
                <p className="tnum mt-0.5 text-sm font-bold">{odds(l.fairOdds)}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-dim">
                  {/*
                    Naming the source is not decoration. A number the user
                    typed and a number a bookmaker's board returned support
                    different conclusions, and the field is editable precisely
                    so a user whose own betslip disagrees can say so.
                  */}
                  {l.oddsSource === "sportybet" ? "SportyBet" : "Your price"}
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

            <LegVerdict
              verdict={assessValue(l.probability, l.bookmakerOdds)}
              breakEven={l.fairOdds}
              live={prices.get(legKey(l))}
            />
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
                  {usingRealOdds ? "Your combined price" : "Combined break-even"}
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

            {fetchedAny && (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Prices read from SportyBet just now. Edit any leg to use the price on your own
                betslip instead — an edited leg is left alone from then on.
              </p>
            )}
          </div>

          <div className="mt-5 space-y-3 border-t border-line pt-5">
            {state === "loading" && !usingRealOdds ? (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Reading SportyBet&apos;s current prices for these selections…
              </p>
            ) : !usingRealOdds ? (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Priced at each leg&apos;s own break-even, so the expected return sits at zero by
                construction — it cannot tell you anything yet.{" "}
                {state === "unavailable"
                  ? "Live prices are not available right now, so enter the prices your bookmaker is actually offering above."
                  : "These selections are not listed on SportyBet, so enter the prices your bookmaker is actually offering above."}{" "}
                Any leg priced below its break-even loses money over time however often it
                lands, and that is the one thing worth knowing before you stake.
              </p>
            ) : (
              worst &&
              worst.verdict.rating === "no-bet" && (
                <div className="rounded-lg border border-rose/25 bg-rose/5 p-3">
                  <Badge tone="rose">Worst leg</Badge>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                    <strong className="font-semibold text-ink">{worst.leg.label}</strong> on{" "}
                    {worst.leg.fixture} is priced below its break-even. The combined figure above
                    averages that away; the bet does not.
                  </p>
                </div>
              )
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
