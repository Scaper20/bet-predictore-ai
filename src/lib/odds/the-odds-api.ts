import "server-only";

import { cached } from "@/lib/providers/cache";
import { consensus, type BookMarket, type MarketQuote } from "./consensus";
import { bookMarketFor, type OddsApiBook } from "./odds-api-markets";
import {
  canSpend,
  costOf,
  readQuota,
  refreshIntervalMs,
  UNKNOWN_QUOTA,
  type Quota,
} from "./budget";
import { findFixture, type FixtureLike } from "./match-fixture";

/**
 * The Odds API -- forty-odd bookmakers' prices for the same match.
 *
 * Its job here is precise and it is not "another odds source". SportyBet
 * answers what a Nigerian user is offered; this answers what that price is
 * worth, by giving the market's own de-vigged opinion to measure it against.
 * Neither is useful alone: a local price with nothing to compare it to is a
 * number, and a global consensus a user cannot bet into is trivia.
 *
 * Two properties shape the whole module. It is metered at one credit per
 * market per region on a 500-a-month allowance, so nothing here fetches
 * speculatively and the market key is chosen from what was actually asked for.
 * And one request returns EVERY upcoming fixture in a competition, so the unit
 * of caching is the league, not the match -- a hundred match pages in the same
 * competition cost the same as one.
 */

/**
 * Competition to The Odds API sport key.
 *
 * Ten of the twelve catalogue leagues are carried. NPFL and the CAF Champions
 * League are not in their sport list at all, which is the same coverage gap
 * every global feed has and precisely the gap SportyBet fills -- a Nigerian
 * book prices the Nigerian league. Those two get a local price and the model's
 * own break-even, with no consensus, and the UI says so rather than implying
 * the market agrees.
 */
const SPORT_KEYS: Record<string, string> = {
  "premier-league": "soccer_epl",
  "champions-league": "soccer_uefa_champs_league",
  "la-liga": "soccer_spain_la_liga",
  "serie-a": "soccer_italy_serie_a",
  bundesliga: "soccer_germany_bundesliga",
  "ligue-1": "soccer_france_ligue_one",
  championship: "soccer_efl_champ",
  eredivisie: "soccer_netherlands_eredivisie",
  "primeira-liga": "soccer_portugal_primeira_liga",
  brasileirao: "soccer_brazil_campeonato",
};

/**
 * One region, deliberately.
 *
 * Cost multiplies by region, and "eu" already carries Pinnacle plus twenty-odd
 * European books -- enough for a median that means something. Adding "uk"
 * doubles the bill to sharpen a number that is already a consensus. If the
 * allowance is ever raised, this is the first line to revisit.
 */
const REGIONS = ["eu"] as const;

/** Which Odds API market key serves a BetriX market id, if any. */
function marketKeyFor(market: string): "h2h" | "totals" | null {
  const family = market.split(":")[0];
  if (family === "1x2") return "h2h";
  if (family === "ou") return "totals";
  return null;
}

interface RawEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsApiBook[];
}

export interface ConsensusEvent extends FixtureLike {
  eventId: string;
  books: OddsApiBook[];
}

/**
 * The last quota the API reported, account-wide.
 *
 * Module state rather than a store: it is a hint that shortens or lengthens a
 * cache, and a cold process simply learns it again on its first call. Nothing
 * is decided from it that would be wrong to re-decide after a deploy.
 */
let quota: Quota = UNKNOWN_QUOTA;

/** What the meter last said. Rendered on the health endpoint. */
export function oddsApiQuota(): Quota {
  return quota;
}

function configured(): string | null {
  return process.env.ODDS_API_KEY?.trim() || null;
}

/**
 * Every upcoming fixture in one competition, priced by every book in region.
 *
 * Returns an empty array for every kind of miss -- no key, no coverage, quota
 * exhausted, upstream down. Callers cannot distinguish them and should not:
 * they all mean "no consensus available", which the UI already renders by
 * falling back to the model's own break-even.
 */
async function board(leagueCode: string, marketKey: string): Promise<ConsensusEvent[]> {
  const key = configured();
  const sportKey = SPORT_KEYS[leagueCode];
  if (!key || !sportKey) return [];

  const cost = costOf([marketKey], REGIONS);
  // Checked before the cache too, so an exhausted month cannot be woken up by
  // a cache expiry into hammering a quota it does not have.
  if (!canSpend(quota, cost)) return [];

  return cached(
    `odds-api:${sportKey}:${marketKey}`,
    refreshIntervalMs(quota),
    async () => {
      if (!canSpend(quota, cost)) return [];

      const url =
        `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
        `?apiKey=${encodeURIComponent(key)}&regions=${REGIONS.join(",")}` +
        `&markets=${marketKey}&oddsFormat=decimal`;

      const response = await fetch(url).catch(() => null);
      if (!response) return [];

      // Read the meter even on a rejection: a 401 or a 429 still reports where
      // the account stands, and that reading is the one that stops the retry.
      quota = readQuota((name) => response.headers.get(name));
      if (!response.ok) return [];

      const body = (await response.json().catch(() => null)) as RawEvent[] | null;
      if (!Array.isArray(body)) return [];

      const out: ConsensusEvent[] = [];
      for (const event of body) {
        if (!event.id || !event.home_team || !event.away_team || !event.commence_time) continue;
        const kickoff = Date.parse(event.commence_time);
        if (!Number.isFinite(kickoff)) continue;
        out.push({
          eventId: event.id,
          homeName: event.home_team,
          awayName: event.away_team,
          kickoff,
          books: event.bookmakers ?? [],
        });
      }
      return out;
    },
  ).catch(() => []);
}

/**
 * What the market makes of one selection on one fixture.
 *
 * Null when the competition is not covered, the market is not a featured one,
 * the fixture cannot be matched confidently, or too few books priced it. Every
 * one of those is a legitimate "we do not know", and the alternative -- a
 * consensus assembled from one or two quotes -- would be the invented-odds
 * problem wearing a different hat.
 */
export async function consensusQuote(
  leagueCode: string | undefined,
  fixture: FixtureLike,
  market: string,
): Promise<MarketQuote | null> {
  if (!leagueCode) return null;
  const marketKey = marketKeyFor(market);
  if (!marketKey) return null;

  const events = await board(leagueCode, marketKey);
  if (events.length === 0) return null;

  const event = findFixture(fixture, events);
  if (!event) return null;

  const rows: BookMarket[] = [];
  for (const book of event.books) {
    const row = bookMarketFor(book, market, {
      home: event.homeName,
      away: event.awayName,
    });
    if (row) rows.push(row);
  }

  return consensus(rows);
}

/** Whether a competition has any consensus coverage at all. */
export function hasConsensusCoverage(leagueCode: string | undefined): boolean {
  return Boolean(leagueCode && SPORT_KEYS[leagueCode]);
}
