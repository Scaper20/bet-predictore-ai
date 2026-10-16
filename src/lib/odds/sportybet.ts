import "server-only";

import { cached } from "@/lib/providers/cache";
import { dataLayer } from "@/lib/providers/data-layer";
import { readBoard, writeBoard } from "./boards";
import { matchesSelection, readOdds, toSportyBet } from "./markets";
import { findFixture, type FixtureLike } from "./match-fixture";
import { parsebotCall, parsebotLive } from "./parsebot";
import { boardDecision, MAX_STALE_MS } from "./parsebot-budget";

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
 * three credits and returns a competition's fixtures WITH their main markets
 * already attached, so one call serves every prediction in that competition.
 * Per-fixture get_event_odds is deliberately never used: two credits per
 * fixture for markets the board already carries.
 *
 * Each board is stored once in public.odds_boards and shared by every
 * serverless instance. A page only asks parse.bot when that stored board has
 * gone stale for how close its next game is (parsebot-budget.ts), and every
 * call goes through parsebot.ts: the kill switch, the allow-list and the
 * credit ledger. While PARSEBOT_LIVE is off, no call is made at all and
 * prices come only from boards already stored.
 *
 * Everything degrades to "no price". A switched-off client, a spent budget, a
 * fixture that cannot be matched confidently — all resolve to undefined, which
 * assessValue() already treats as "the user has not given us a price", and the
 * UI already renders. There is no path here that invents an odds figure.
 */

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

export function sportyBetBoardKey(page: number, pageSize: number, tournamentId?: string): string {
  return `sportybet:upcoming:${tournamentId ?? "all"}:${page}:${pageSize}`;
}

/**
 * One board: from the stored copy while it is fresh, from parse.bot when it
 * is stale and a call is allowed, written back so every instance shares it.
 *
 * `fromJob` is the snapshot cron, which may fetch whatever the data layer
 * says; page traffic in "db" mode never fetches.
 */
export async function sportyBetBoard(
  page: number,
  pageSize: number,
  tournamentId?: string,
  fromJob = false,
): Promise<SportyBetEvent[]> {
  const key = sportyBetBoardKey(page, pageSize, tournamentId);
  // Five minutes in memory on top of the shared copy, so a burst of renders
  // on one instance costs one database read rather than one each.
  return cached(`sportybet:board:${key}:${fromJob ? "job" : "page"}`, fromJob ? 0 : 5 * 60_000, async () => {
    const stored = await readBoard<SportyBetEvent[]>(key);
    const canFetch = parsebotLive() && (fromJob || (await dataLayer()) !== "db");
    const decision = boardDecision(
      stored ? { fetchedAt: stored.fetchedAt, events: stored.payload } : null,
      canFetch,
    );
    if (decision === "use" || decision === "stale-ok") return stored!.payload;
    if (decision === "none") return [];

    const fresh = await fetchUpcomingPage(page, pageSize, tournamentId);
    if (fresh === null) {
      // Refused (budget) or failed: an old board beats nothing, up to a point.
      return stored && Date.now() - stored.fetchedAt < MAX_STALE_MS ? stored.payload : [];
    }
    // Stored even when empty, so a competition between rounds is not asked
    // again on every render.
    await writeBoard(key, "odds", fresh, { tournamentId: tournamentId ?? null, page }).catch(() => {});
    return fresh;
  });
}

/**
 * One metered call for one page of upcoming football, markets attached.
 * Null when the call was not made or failed; an empty array when SportyBet
 * genuinely lists nothing.
 */
async function fetchUpcomingPage(
  page: number,
  pageSize: number,
  tournamentId?: string,
): Promise<SportyBetEvent[] | null> {
  const body = await parsebotCall<{ tournaments?: { events?: RawEvent[] }[] }>("get_upcoming_events", {
    query: { sport: "football", page, page_size: pageSize, tournament_id: tournamentId },
    note: tournamentId ?? `page ${page}`,
  });
  if (!body) return null;

  const out: SportyBetEvent[] = [];
  for (const tournament of body.tournaments ?? []) {
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
export const PAGE_SIZE = 100;

/**
 * The fixture on SportyBet's board, or null.
 *
 * Asking for the competition by id is the whole design. The board is ordered
 * by competition and runs to 2,093 events, so scanning it for a Brazilian
 * fixture meant eight sequential pages, thirty-seven seconds, and still no
 * result -- while one call carrying tournament_id returns that competition's
 * entire fixture list with markets attached.
 */
export async function findOnBoard(
  fixture: FixtureLike,
  tournamentId?: string,
): Promise<SportyBetEvent | null> {
  // No id, no lookup. Competitions outside the catalogue used to scan the
  // first two pages of the unfiltered board, but those boards are dominated
  // by games kicking off within hours, so they went stale every hour: six
  // credits an hour for a hit that was rarely there.
  if (!tournamentId) return null;
  const events = await sportyBetBoard(1, PAGE_SIZE, tournamentId);
  return findFixture(fixture, events);
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
