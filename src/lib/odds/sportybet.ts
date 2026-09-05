import "server-only";

import { cached } from "@/lib/providers/cache";
import { matchesSelection, readOdds, toSportyBet } from "./markets";
import { findFixture, type FixtureLike } from "./match-fixture";

/**
 * SportyBet prices, via parse.bot's marketplace API.
 *
 * The reason this is worth having, and worth having FIRST among odds sources:
 * the backtest concluded the model is roughly market-efficient, returning
 * about -2% against closing consensus. It has no edge over the market. What it
 * can do is tell a Nigerian user whether the price SportyBet is showing them
 * right now is worse than the model's own break-even — and SportyBet is where
 * that price actually lives. A global consensus feed cannot answer that
 * question; this can.
 *
 * Metered per call, which shapes everything below. get_upcoming_events costs
 * three credits and returns a whole page of fixtures WITH their main markets
 * already attached, so one call serves many predictions. Per-fixture
 * get_event_odds is deliberately not used on the read path: it costs two
 * credits per fixture for markets the page call mostly already carries.
 *
 * Everything degrades to "no price". A missing key, an exhausted quota, a
 * fixture that cannot be matched confidently — all resolve to undefined, which
 * assessValue() already treats as "the user has not given us a price", and the
 * UI already renders. There is no path here that invents an odds figure.
 */

const SCRAPER = "8ffd9f0c-6174-43af-80dc-4898f47f074b";
const BASE = `https://api.parse.bot/scraper/${SCRAPER}`;

/**
 * Pinned rather than following the live canonical.
 *
 * parse.bot's own guidance: an unversioned canonical follows whatever the
 * scraper's author publishes next, and is explicitly not stable. A silent
 * change to the response shape here would surface as prices quietly
 * disappearing, so the version moves when someone chooses to move it.
 */
const SNAPSHOT_VERSION = "15";

/** SportyBet's own market entry, as the payload presents it. */
interface RawMarket {
  market_id?: string | number;
  specifier?: string | null;
  outcomes?: { id?: string | number; odds?: unknown }[];
}

interface RawEvent {
  event_id?: string;
  home_team?: string;
  away_team?: string;
  start_time?: number;
  markets?: RawMarket[];
}

/** A fixture on SportyBet, in the shape findFixture needs. */
export interface SportyBetEvent extends FixtureLike {
  eventId: string;
  markets: RawMarket[];
}

function configured(): string | null {
  return process.env.PARSEBOT_API_KEY?.trim() || null;
}

/**
 * One page of upcoming football, with main markets attached.
 *
 * Cached for fifteen minutes. Pre-match prices do drift, but every call is
 * three credits against a metered plan, and a fifteen-minute-old price is
 * still the right answer to "is this book's price roughly fair" — which is the
 * question being asked, rather than "what can I take this second".
 */
async function upcomingPage(
  page: number,
  pageSize: number,
  tournamentId?: string,
): Promise<SportyBetEvent[]> {
  const key = configured();
  if (!key) return [];

  return cached(`sportybet:upcoming:${tournamentId ?? "all"}:${page}:${pageSize}`, 15 * 60_000, async () => {
    const url =
      `${BASE}/get_upcoming_events?sport=football&page=${page}&page_size=${pageSize}` +
      (tournamentId ? `&tournament_id=${encodeURIComponent(tournamentId)}` : "");
    const response = await fetch(url, {
      headers: { "X-API-Key": key, "API-Snapshot-Version": SNAPSHOT_VERSION },
    }).catch(() => null);
    if (!response?.ok) return [];

    const body = (await response.json().catch(() => null)) as
      | { data?: { tournaments?: { events?: RawEvent[] }[] } }
      | null;

    const out: SportyBetEvent[] = [];
    for (const tournament of body?.data?.tournaments ?? []) {
      for (const event of tournament.events ?? []) {
        if (!event.event_id || !event.home_team || !event.away_team) continue;
        if (typeof event.start_time !== "number") continue;
        out.push({
          eventId: event.event_id,
          homeName: event.home_team,
          awayName: event.away_team,
          kickoff: event.start_time,
          markets: event.markets ?? [],
        });
      }
    }
    return out;
  });
}

/**
 * The board is ordered by competition, not by kickoff.
 *
 * Measured, not assumed, and it is the fact the whole traversal turns on. Page
 * one carries the Premier League, LaLiga, the Bundesliga and Serie A; the
 * Brasileirao and the rest sit further back, and the board runs to 2,093
 * events in total. So "fetch the first three pages" -- which is what this did
 * -- silently meant "only the biggest four European leagues have prices", and
 * a Brazilian fixture rendered as Not listed while the model happily published
 * a pick on it.
 *
 * page_size does not rescue that: 200 is rejected outright with a 502, and 60
 * returns whole tournaments rather than a fixed count, so a page is between
 * about 30 and 60 events.
 */
const PAGE_SIZE = 100;

/**
 * How far into the unfiltered board to look for a competition with no id.
 *
 * Only reached for competitions outside the catalogue, where a hit is
 * unlikely anyway, so this is a courtesy rather than a strategy. Two pages of
 * a hundred covers the dozen or so tournaments SportyBet leads with; past
 * that, the honest answer is that we have no price.
 */
const FALLBACK_PAGES = 2;

/**
 * The fixture on SportyBet's board, or null.
 *
 * Asking for the competition by id is the whole design. The board is ordered
 * by competition and runs to 2,093 events, so scanning it for a Brazilian
 * fixture meant eight sequential pages, thirty-seven seconds, and still no
 * result -- while one call carrying tournament_id returns that competition's
 * entire fixture list with markets attached.
 */
async function findOnBoard(
  fixture: FixtureLike,
  tournamentId?: string,
): Promise<SportyBetEvent | null> {
  if (tournamentId) {
    const events = await upcomingPage(1, PAGE_SIZE, tournamentId);
    return findFixture(fixture, events);
  }

  for (let page = 1; page <= FALLBACK_PAGES; page++) {
    const events = await upcomingPage(page, PAGE_SIZE);
    // An empty page is the end of the board, or a provider that is down.
    if (events.length === 0) return null;
    const hit = findFixture(fixture, events);
    if (hit) return hit;
  }
  return null;
}

/**
 * SportyBet's price for one selection on one fixture, if it can be found.
 *
 * Returns undefined for every kind of miss — unconfigured, unmatched fixture,
 * market not offered, outcome suspended. The caller cannot tell those apart,
 * and should not: they all mean "we have no price to show".
 */
export async function sportyBetPrice(
  fixture: FixtureLike,
  market: string,
  tournamentId?: string,
): Promise<number | undefined> {
  const selection = toSportyBet(market);
  if (!selection) return undefined;

  const event = await findOnBoard(fixture, tournamentId).catch(() => null);
  if (!event) return undefined;

  const entry = event.markets.find((m) => matchesSelection(m, selection));
  if (!entry) return undefined;

  const outcome = entry.outcomes?.find((o) => String(o.id) === selection.outcomeId);
  return readOdds(outcome?.odds);
}
