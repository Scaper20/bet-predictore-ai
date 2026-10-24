import "server-only";

import { leagueByCode } from "@/lib/leagues";
import { cached } from "@/lib/providers/cache";
import { dataLayer } from "@/lib/providers/data-layer";
import { readBoard, writeBoard } from "./boards";
import { priceOn, toSportyBet } from "./markets";
import { type FixtureLike } from "./match-fixture";
import { parsebotCall, parsebotLive } from "./parsebot";
import { boardDecision, directBoardTtlMs, MAX_STALE_MS } from "./parsebot-budget";
import type { RawMarket, SportyBetEvent } from "./sportybet-api";
import { directEnabled, fetchTournamentEvents } from "./sportybet-direct";
import { memoryFor, saveEventLinks, saveLearned, sportyBetTournament, storedEventLink } from "./sportybet-links";
import { matchOne } from "./sportybet-match";

export type { SportyBetEvent } from "./sportybet-api";

/**
 * SportyBet prices: straight from SportyBet first, parse.bot as a fallback.
 *
 * The reason this is worth having, and worth having FIRST among odds sources:
 * the backtest concluded the model is roughly market-efficient, returning
 * about -2% against closing consensus. It has no edge over the market. What it
 * can do is tell a Nigerian user whether the price SportyBet is showing them
 * right now is worse than the model's own break-even — and SportyBet is where
 * that price actually lives. A global consensus feed cannot answer that
 * question; this can.
 *
 * One board per competition: SportyBet's upcoming list filtered by its
 * tournament id, markets attached, so one fetch serves every prediction in
 * that competition. Each board is stored once in public.odds_boards and
 * shared by every serverless instance.
 *
 * - Direct (sportybet-direct.ts) is free, so its boards refresh on a short
 *   TTL. Its events carry Sportradar competitor ids, which is what lets the
 *   matcher (sportybet-match.ts) learn a club once and stop comparing names.
 * - parse.bot is metered, so it is only used when direct is switched off or
 *   SportyBet is refusing us, and only when its own switch is on.
 *
 * Everything degrades to "no price". A refused call, a spent budget, a
 * fixture that cannot be matched confidently — all resolve to undefined, which
 * assessValue() already treats as "the user has not given us a price", and the
 * UI already renders. There is no path here that invents an odds figure.
 */

interface RawEvent {
  event_id?: string;
  home_team?: string;
  away_team?: string;
  start_time?: number;
  markets?: RawMarket[];
}

/**
 * When each competition's board was read from SportyBet, as last served on
 * this instance. Prices move constantly, so a price is only shown with its
 * age: "as of 14:05", never "live".
 */
const boardReadAt = new Map<string, number>();

/** When the board behind a competition's prices was read, or null if never. */
export function sportyBetPricedAt(tournamentId: string): number | null {
  return boardReadAt.get(tournamentId) ?? null;
}

export function sportyBetBoardKey(page: number, pageSize: number, tournamentId?: string): string {
  return `sportybet:upcoming:${tournamentId ?? "all"}:${page}:${pageSize}`;
}

/** Stored separately from parse.bot's boards: they carry competitor ids, which those lack. */
export function directBoardKey(tournamentId: string): string {
  return `sportybet:direct:${tournamentId}`;
}

/**
 * parse.bot's page size. The board is ordered by competition; page_size 200
 * is rejected with a 502, and one call carrying tournament_id returns that
 * competition's whole list.
 */
export const PAGE_SIZE = 100;

/**
 * One competition's board: the stored copy while it is fresh, otherwise
 * SportyBet directly, otherwise parse.bot, otherwise an old copy, up to a
 * point. Written back so every instance shares it.
 *
 * `fromJob` is a cron, which may fetch whatever the data layer says and
 * skips the in-memory cache.
 */
export async function sportyBetBoard(tournamentId: string, fromJob = false): Promise<SportyBetEvent[]> {
  return cached(`sportybet:board:${tournamentId}:${fromJob ? "job" : "page"}`, fromJob ? 0 : 5 * 60_000, async () => {
    if (await directEnabled()) {
      const key = directBoardKey(tournamentId);
      const stored = await readBoard<SportyBetEvent[]>(key);
      const decision = boardDecision(
        stored ? { fetchedAt: stored.fetchedAt, events: stored.payload } : null,
        true,
        Date.now(),
        directBoardTtlMs,
      );
      if (decision === "use") {
        boardReadAt.set(tournamentId, stored!.fetchedAt);
        return stored!.payload;
      }
      const fresh = await fetchTournamentEvents(tournamentId);
      if (fresh) {
        boardReadAt.set(tournamentId, Date.now());
        // Stored even when empty, so a competition between rounds is not
        // asked again on every render.
        await writeBoard(key, "odds", fresh, { tournamentId, via: "direct" }).catch(() => {});
        return fresh;
      }
      // Refused or unreachable: an old direct board beats a metered call
      // while it is still fairly fresh.
      if (stored && Date.now() - stored.fetchedAt < 6 * 3_600_000) {
        boardReadAt.set(tournamentId, stored.fetchedAt);
        return stored.payload;
      }
    }
    return parsebotBoard(tournamentId, fromJob);
  });
}

async function parsebotBoard(tournamentId: string, fromJob: boolean): Promise<SportyBetEvent[]> {
  const key = sportyBetBoardKey(1, PAGE_SIZE, tournamentId);
  const stored = await readBoard<SportyBetEvent[]>(key);
  const canFetch = (await parsebotLive()) && (fromJob || (await dataLayer()) !== "db");
  const decision = boardDecision(stored ? { fetchedAt: stored.fetchedAt, events: stored.payload } : null, canFetch);
  if (decision === "use" || decision === "stale-ok") {
    boardReadAt.set(tournamentId, stored!.fetchedAt);
    return stored!.payload;
  }
  if (decision === "none") return [];

  const fresh = await fetchParsebotPage(tournamentId);
  if (fresh === null) {
    if (stored && Date.now() - stored.fetchedAt < MAX_STALE_MS) {
      boardReadAt.set(tournamentId, stored.fetchedAt);
      return stored.payload;
    }
    return [];
  }
  boardReadAt.set(tournamentId, Date.now());
  await writeBoard(key, "odds", fresh, { tournamentId, page: 1 }).catch(() => {});
  return fresh;
}

/** One metered call for a competition's board. Null when not made or failed. */
async function fetchParsebotPage(tournamentId: string): Promise<SportyBetEvent[] | null> {
  const body = await parsebotCall<{ tournaments?: { events?: RawEvent[] }[] }>("get_upcoming_events", {
    query: { sport: "football", page: 1, page_size: PAGE_SIZE, tournament_id: tournamentId },
    note: tournamentId,
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
        tournamentId,
      });
    }
  }
  return out;
}

export interface BoardLookup {
  /** Our catalogue slug; its SportyBet tournament id decides which board. */
  leagueCode?: string;
  /** Our public match id ("fd:123"), when the caller has one: reuses a stored link. */
  matchId?: string;
}

/**
 * The fixture on SportyBet's board, or null.
 *
 * A fixture matched before (by the daily sync or an earlier lookup) is read
 * back by id. Otherwise the matcher runs against the competition's board
 * with everything it has learned: ids, names, aliases and anchors -- never
 * elimination, which only the whole round can support. What it learns here
 * is stored for next time.
 */
export async function findOnBoard(fixture: FixtureLike, lookup: BoardLookup): Promise<SportyBetEvent | null> {
  const league = lookup.leagueCode ? leagueByCode(lookup.leagueCode) : undefined;
  const tournamentId = league ? await sportyBetTournament(league.code) : null;
  // No id, no lookup: scanning the unfiltered board for a competition it
  // does not know costs many calls for a hit that is rarely there.
  if (!league || !tournamentId) return null;
  const events = await sportyBetBoard(tournamentId);
  if (events.length === 0) return null;

  if (lookup.matchId) {
    const stored = await storedEventLink(lookup.matchId);
    const hit = stored && events.find((e) => e.eventId === stored.eventId);
    if (hit) return hit;
  }

  const memory = await memoryFor(league.code, [fixture.homeName, fixture.awayName]);
  const found = matchOne(fixture, events, memory);
  if (!found) return null;
  if (found.learned.length || lookup.matchId) {
    // Best effort, off the response's critical path in practice: both
    // swallow their own failures.
    await Promise.all([
      saveLearned(league.code, found.learned),
      lookup.matchId
        ? saveEventLinks(league.code, [{ matchId: lookup.matchId, event: found.event, method: found.method }])
        : Promise.resolve(),
    ]);
  }
  return found.event;
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
  lookup: BoardLookup,
): Promise<number | undefined> {
  const selection = toSportyBet(market);
  if (!selection) return undefined;

  const event = await findOnBoard(fixture, lookup).catch(() => null);
  if (!event) return undefined;

  return priceOn(selection, event.markets);
}
