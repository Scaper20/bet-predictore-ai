"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { legTeams, useSlip, type SlipLeg } from "@/lib/slip";
import { accumulator } from "@/lib/model/odds";
import { RiskBadge } from "@/components/ui/risk-badge";
import { Badge, Button, ButtonLink, EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { odds, percent } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import { sportPath, matchPath } from "@/lib/routes";
import { worstLeg } from "@/lib/value";
import { BookCodeButton } from "@/components/slip/book-code-button";

/** One selection's live prices, as /api/odds returns them. */
interface LivePrice {
  key: string;
  price: number | null;
  rating: "value" | "best" | "competitive" | "short" | "poor" | null;
  reason: string | null;
  marketPrice: number | null;
  best: number | null;
  books: number | null;
  /** When SportyBet's board behind `price` was read, epoch ms. */
  pricedAt: number | null;
}

/**
 * How often an open slip asks again. SportyBet's prices move constantly, and
 * the server reads a board with a game inside two hours every ten minutes,
 * so asking more often than this would mostly return the same numbers.
 */
const REFRESH_MS = 5 * 60_000;

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

  // Re-asks every few minutes while the slip is on screen, since the prices
  // keep moving. A hidden tab does not tick; it catches up when shown.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (signature === "") return;
    const bump = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    const timer = window.setInterval(bump, REFRESH_MS);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", bump);
    };
  }, [signature]);

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
  }, [signature, tick]);

  const current = result?.signature === signature ? result : null;
  // The OLDEST board behind any shown price: the honest age of the set.
  const stamps = [...(current?.prices.values() ?? [])]
    .map((p) => (p.price !== null ? p.pricedAt : null))
    .filter((t): t is number => typeof t === "number");
  return {
    prices: current?.prices ?? NO_PRICES,
    state: signature === "" ? "idle" : (current?.status ?? "loading"),
    pricedAt: stamps.length ? Math.min(...stamps) : null,
  } as const;
}

/** A leg's SportyBet price, when the board had one. Prices typed into older versions of the slip are ignored. */
const sportyPrice = (l: SlipLeg) => (l.oddsSource === "sportybet" && (l.bookmakerOdds ?? 0) > 1 ? l.bookmakerOdds : undefined);

/**
 * The slip's legs and their combined chance. "sheet" is the overlay layout
 * (components/slip/slip-sheet.tsx): one column, no page-style card, and the
 * clear button lives in the sheet's own header.
 */
export function SlipView({ variant = "page" }: { variant?: "page" | "sheet" }) {
  const sheet = variant === "sheet";
  const { legs, remove, clear, applyFetchedOdds } = useSlip();
  const { prices, state, pricedAt } = useLivePrices(legs, applyFetchedOdds);
  const fetchedAny = useMemo(
    () => legs.some((l) => l.oddsSource === "sportybet"),
    [legs],
  );

  if (legs.length === 0) {
    if (sheet) {
      return (
        <div className="px-1 py-10 text-center">
          <p className="text-sm font-semibold">Your combo is empty</p>
          <p className="mt-1 text-xs text-ink-dim">Tap + Combo on any pick to add it here.</p>
          <div className="mt-5 flex justify-center gap-2">
            <ButtonLink href={sportPath("predictions")} className="px-4 py-2 text-xs">Browse picks</ButtonLink>
            <ButtonLink href={sportPath("forge")} variant="secondary" className="px-4 py-2 text-xs">Let Forge build one</ButtonLink>
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        icon="🧾"
        title="No selections yet"
        description="Tap + Combo on any pick to add it here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink href={sportPath("forge")}>Let Forge build one</ButtonLink>
            <ButtonLink href={sportPath("predictions")} variant="secondary">Browse predictions</ButtonLink>
          </div>
        }
      />
    );
  }

  const priced = legs.map((l) => ({
    probability: l.probability,
    decimalOdds: sportyPrice(l) ?? l.fairOdds,
  }));
  const acc = accumulator(priced);
  const usingRealOdds = legs.some((l) => sportyPrice(l) !== undefined);

  /*
   * The combined return averages the legs, and averages are how a bad price
   * survives: one leg at 1.15 against a 1.25 break-even and one genuinely long
   * leg net out to something unremarkable, and the user takes both. This
   * surfaces the worst one by name.
   */
  const worst = worstLeg(legs, (l) => ({
    probability: l.probability,
    price: sportyPrice(l),
  }));

  // Legs from the same competition on the same day are not independent — a
  // weather or refereeing effect hits several at once — and the multiplication
  // below quietly assumes they are.
  const dayLeagueKeys = legs.map((l) => `${l.league}|${l.kickoff.slice(0, 10)}`);
  const correlated = new Set(dayLeagueKeys).size < dayLeagueKeys.length;

  return (
    /*
     * min-w-0 on both tracks, and it is load-bearing rather than defensive.
     *
     * A grid item defaults to min-width:auto, so a track never shrinks below
     * its content's min-content width. The fixture link inside carries
     * `truncate`, which sets white-space:nowrap — and a nowrap string's
     * min-content is the WHOLE string. So "Wolverhampton Wanderers v Brighton
     * and Hove Albion" reported 359px, the single mobile column sized itself
     * to that, and the slip pushed the document 34px into horizontal scroll on
     * a phone. Short fixture names hid it, which is why it survived: the bug
     * only appears when someone adds a leg with long club names.
     */
    <div className={sheet ? "space-y-3" : "grid gap-5 lg:grid-cols-[1.5fr_1fr]"}>
      <div className={`min-w-0 ${sheet ? "space-y-2" : "space-y-3"}`}>
        {legs.map((l) => {
          const live = prices.get(legKey(l));
          const rating = live?.rating && live.marketPrice !== null ? RATINGS[live.rating] : null;
          return (
            <div key={l.matchId} className="card flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-ink-dim">
                  {l.league} · <LocalTime iso={l.kickoff} kind="relative" /> <LocalTime iso={l.kickoff} />
                </p>
                <Link href={matchPath(l.matchId)} className="mt-0.5 block truncate text-sm font-semibold hover:text-brand">
                  {l.fixture}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm text-brand">{l.label}</span>
                  {sportyPrice(l) && (
                    <span className="tnum rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted">
                      Market <span className="font-semibold text-ink">{odds(sportyPrice(l)!)}</span>
                    </span>
                  )}
                  {rating && <Badge tone={rating.tone}>{rating.label}</Badge>}
                  <RiskBadge pick={l} />
                </div>
              </div>
              <span className="tnum shrink-0 text-sm font-bold">{percent(l.probability)}</span>
              <button
                type="button"
                onClick={() => remove(l.matchId)}
                className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-surface-2 hover:text-rose"
                aria-label={`Remove ${l.fixture}`}
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}

        {!sheet && (
          <Button variant="secondary" onClick={clear} className="w-full py-2.5">
            Clear combo
          </Button>
        )}
      </div>

      <aside className={sheet ? "min-w-0" : "min-w-0 lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start"}>
        <div className={sheet ? "rounded-xl border border-line bg-surface-2/50 p-4" : "card p-5 sm:p-7"}>
          {!sheet && (
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">
              Combined pick
            </h2>
          )}

          <div className={`${sheet ? "" : "mt-5"} space-y-4`}>
            <div>
              <p className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-ink-dim">
                Chance all {legs.length} land
                <RiskBadge pick={{ market: "combo", probability: acc.probability }} />
              </p>
              <p className={`tnum mt-1 font-mono tracking-tighter font-semibold text-brand ${sheet ? "text-2xl" : "text-3xl"}`}>
                {percent(acc.probability, acc.probability < 0.1 ? 2 : 1)}
              </p>
              <div className="mt-3">
                <ProbabilityBar value={acc.probability} tone="brand" />
              </div>
            </div>

            {usingRealOdds && (
            <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-dim">
                  Combined price
                </dt>
                <dd className="tnum mt-0.5 text-lg font-bold">{odds(acc.decimalOdds)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-ink-dim">
                  Value vs fair
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
            )}

            {fetchedAny && (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                {pricedAt ? (
                  <>
                    SportyBet prices as of <LocalTime iso={new Date(pricedAt).toISOString()} />.{" "}
                  </>
                ) : (
                  "SportyBet prices. "
                )}
                They move until kick-off, so this refreshes every few minutes.
              </p>
            )}

            <div className="border-t border-line pt-4">
              <BookCodeButton legs={legs} remove={remove} />
            </div>
          </div>

          {(state === "loading" && !usingRealOdds) || (usingRealOdds && worst?.verdict.rating === "no-bet") || correlated || legs.length >= 5 ? (
          <div className="mt-5 space-y-3 border-t border-line pt-5">
            {state === "loading" && !usingRealOdds ? (
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Reading current market prices for these selections…
              </p>
            ) : !usingRealOdds ? null : (
              worst &&
              worst.verdict.rating === "no-bet" && (
                <div className="rounded-lg border border-rose/25 bg-rose/5 p-3">
                  <Badge tone="rose">Weakest pick</Badge>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                    <strong className="font-semibold text-ink">{worst.leg.label}</strong> on{" "}
                    {worst.leg.fixture} is priced too short.
                  </p>
                </div>
              )
            )}

            {correlated && (
              <div className="rounded-lg border border-amber/25 bg-amber/5 p-3">
                <Badge tone="amber">Linked picks</Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  Two or more of these are in the same competition on the same day. The maths here
                  assumes picks are independent, so the real chance of them all landing differs from
                  the number above.
                </p>
              </div>
            )}

            {legs.length >= 5 && (
              <div className="rounded-lg border border-rose/25 bg-rose/5 p-3">
                <Badge tone="rose">Long combo</Badge>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  At {legs.length} picks this lands roughly {percent(acc.probability, 2)} of the
                  time. Every pick you add multiplies the chance of the combo going wrong, so a long
                  combo looks exciting because it almost never lands.
                </p>
              </div>
            )}
          </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
