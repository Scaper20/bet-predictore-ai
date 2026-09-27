import "server-only";

import type { Match } from "@/lib/types";
import type { Pick } from "@/lib/model/predict";
import { leagueByCode } from "@/lib/leagues";
import { assessValue, type ValueVerdict } from "@/lib/value";
import { priceGap, ratePrice, type MarketQuote, type PriceVerdict } from "./consensus";
import { consensusQuote, hasConsensusCoverage } from "./the-odds-api";
import { sportyBetPrice } from "./sportybet";
import { isQuotable } from "./markets";
import type { FixtureLike } from "./match-fixture";

/**
 * One answer to "what is this selection actually worth", from every source
 * that has an opinion.
 *
 * Three numbers, and the order they are trusted in is the entire design:
 *
 *   1. What SportyBet is offering.        The price the user can actually take.
 *   2. What twenty-five books offer.      What that price should be measured against.
 *   3. What the model thinks.             Used when nobody else has an opinion.
 *
 * The model comes THIRD, and that is not modesty. The backtest measured it at
 * about -2% against closing consensus across 4,502 picks: it is roughly
 * market-efficient, so judging a price against it finds edges that are inside
 * its own error bars. A disagreement between twenty-five bookmakers is real,
 * measurable, and does not require the model to be right about anything.
 *
 * Where no consensus exists -- NPFL, the CAF Champions League, any market
 * beyond 1X2 and totals -- the model's own break-even is all there is, and the
 * UI says so. The distinction is the difference between "the market disagrees
 * with this price" and "we disagree with this price", and a user is entitled
 * to know which they are being told.
 */

/** The book whose prices a Nigerian user can actually take. */
export const LOCAL_BOOK = "SportyBet";

export interface SelectionPricing {
  market: string;
  label: string;
  /** The model's probability for this selection. */
  probability: number;
  /** The model's own break-even price. */
  breakEven: number;
  /** SportyBet's live price, or null when it does not offer or list this. */
  local: number | null;
  /** The market's de-vigged opinion, or null when it has none. */
  consensus: MarketQuote | null;
  /**
   * How the local price stands against what the rest of the market offers.
   *
   * The headline verdict wherever it exists, because it is the one that
   * varies between selections and therefore the one a user can act on.
   */
  priceVerdict: PriceVerdict | null;
  /**
   * The model's own reading of the local price.
   *
   * Shown only where there is no consensus to beat it, and labelled as ours.
   */
  modelVerdict: ValueVerdict | null;
  /**
   * How much longer the best price anywhere is than the local one.
   *
   * Positive means SportyBet is not the best price on the market. Shown
   * because a user losing 4% to their own bookmaker is worth knowing even
   * though this product cannot place the bet for them.
   */
  betterElsewhere: number | null;
}

/**
 * Everything needed to price one selection, without a full Match.
 *
 * The slip is why this shape exists: its legs live in the user's own browser
 * storage and have never been near a provider, so the server is handed team
 * names and a kickoff rather than a fixture it can look up.
 */
export interface QuoteRequest {
  homeName: string;
  awayName: string;
  /** Epoch milliseconds. */
  kickoff: number;
  /** Catalogue slug. Without it there is a local price but no consensus. */
  leagueCode?: string;
  market: string;
  label: string;
  /** The model's probability, used only where the market has no opinion. */
  probability: number;
  /** The model's break-even price. */
  fairOdds: number;
}

function requestFor(match: Match, pick: Pick): QuoteRequest {
  return {
    homeName: match.home.name,
    awayName: match.away.name,
    kickoff: Date.parse(match.kickoff),
    leagueCode: match.league.code,
    market: pick.market,
    label: pick.label,
    probability: pick.probability,
    fairOdds: pick.fairOdds,
  };
}

/**
 * Price one selection from every source that carries it.
 *
 * Never throws and never invents. Each source resolves independently, so a
 * dead SportyBet still yields a consensus and an exhausted Odds API quota
 * still yields a local price.
 */
async function priceOne(pick: QuoteRequest): Promise<SelectionPricing> {
  const fixture: FixtureLike = {
    homeName: pick.homeName,
    awayName: pick.awayName,
    kickoff: pick.kickoff,
  };

  // Asking SportyBet for the competition by id turns a scan of a 2,093-event
  // board into one call. Absent for competitions outside the catalogue, which
  // fall back to a shallow scan of the board's leading tournaments.
  const tournamentId = pick.leagueCode ? leagueByCode(pick.leagueCode)?.ids.sportyBet : undefined;

  const [local, quote] = await Promise.all([
    isQuotable(pick.market)
      ? sportyBetPrice(fixture, pick.market, tournamentId).catch(() => undefined)
      : Promise.resolve(undefined),
    consensusQuote(pick.leagueCode, fixture, pick.market).catch(() => null),
  ]);

  const price = typeof local === "number" ? local : null;

  // No blending. An average of a market median and a model estimate is a
  // number with no owner, and the point of keeping them apart is that the
  // reader can weigh each on its own terms.
  const priceVerdict = price !== null && quote ? ratePrice(price, quote) : null;

  return {
    market: pick.market,
    label: pick.label,
    probability: pick.probability,
    breakEven: pick.fairOdds,
    local: price,
    consensus: quote,
    priceVerdict,
    // Only where the market has nothing to say. Where it does, the model's
    // opinion of a price is the weaker of two available answers and showing
    // both invites the reader to pick whichever they prefer.
    modelVerdict: price !== null && !quote ? assessValue(pick.probability, price, "model") : null,
    betterElsewhere:
      price !== null && quote && quote.best.price > price
        ? priceGap(quote.best.price, price)
        : null,
  };
}

/**
 * Price a set of selections on one fixture.
 *
 * Runs them concurrently, which costs nothing extra: both providers are
 * fetched a whole competition at a time and cached, so twenty selections on
 * the same match resolve from the same two responses as one.
 */
export async function priceSelections(
  match: Match,
  picks: Pick[],
): Promise<SelectionPricing[]> {
  if (picks.length === 0) return [];
  return Promise.all(picks.map((pick) => priceOne(requestFor(match, pick))));
}

/**
 * Price selections described directly, for callers without a Match object.
 *
 * Concurrency is safe at any width the caller sends: the cache coalesces
 * in-flight requests by key, so ten legs in three competitions resolve to at
 * most four upstream calls however they are ordered.
 */
export async function priceQuotes(requests: QuoteRequest[]): Promise<SelectionPricing[]> {
  if (requests.length === 0) return [];
  return Promise.all(requests.map((request) => priceOne(request)));
}

export { hasConsensusCoverage };
export { oddsApiQuota } from "./the-odds-api";
export type { MarketQuote, PriceVerdict, ValueVerdict };
