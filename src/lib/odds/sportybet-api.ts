import type { BookedCode, BookSelection } from "./booking";
import type { FixtureLike } from "./match-fixture";

/**
 * Reading SportyBet's own JSON API: the pure half of sportybet-direct.ts.
 *
 * The mobile site (sportybet.com/ng/m/) is a client of a plain JSON API under
 * /api/ng/, so nothing here scrapes HTML. Every response is wrapped as
 * { bizCode, message, data }, and bizCode 10000 is the only success: SportyBet
 * answers a failed booking with HTTP 200 and bizCode 19999.
 *
 * What makes this worth having over parse.bot's copy of the same data is the
 * ids. Each event carries its teams' Sportradar competitor ids
 * ("sr:competitor:44"), and those never change spelling, so once a club has
 * been matched by name it can be matched by id for good (sportybet-match.ts).
 */

export const BIZ_OK = 10000;

/** SportyBet's market entry, in the shape the stored boards already use. */
export interface RawMarket {
  market_id?: string | number;
  specifier?: string | null;
  outcomes?: { id?: string | number; odds?: unknown }[];
}

/** A fixture on SportyBet: the board shape, plus the ids the matcher learns from. */
export interface SportyBetEvent extends FixtureLike {
  eventId: string;
  markets: RawMarket[];
  /** "sr:competitor:N". Absent on boards stored from parse.bot. */
  homeId?: string;
  awayId?: string;
  tournamentId?: string;
}

interface ApiOutcome {
  id?: unknown;
  odds?: unknown;
  isActive?: unknown;
}

interface ApiMarket {
  id?: unknown;
  specifier?: unknown;
  status?: unknown;
  outcomes?: ApiOutcome[];
}

interface ApiEvent {
  eventId?: unknown;
  estimateStartTime?: unknown;
  homeTeamId?: unknown;
  homeTeamName?: unknown;
  awayTeamId?: unknown;
  awayTeamName?: unknown;
  markets?: ApiMarket[];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The `data` of a successful response, or null for anything else. */
export function okData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { bizCode?: unknown; data?: unknown };
  if (b.bizCode !== BIZ_OK) return null;
  return b.data && typeof b.data === "object" ? (b.data as Record<string, unknown>) : null;
}

/**
 * Markets reduced to the board shape. A suspended market or an inactive
 * outcome is dropped rather than kept with a price nobody can take.
 */
function readMarkets(markets: ApiMarket[] | undefined): RawMarket[] {
  const out: RawMarket[] = [];
  for (const m of markets ?? []) {
    const id = text(m.id) ?? (typeof m.id === "number" ? String(m.id) : null);
    if (!id || (m.status !== undefined && m.status !== 0)) continue;
    const outcomes = (m.outcomes ?? [])
      .filter((o) => o.isActive === undefined || o.isActive === 1)
      .flatMap((o) => {
        const oid = text(o.id) ?? (typeof o.id === "number" ? String(o.id) : null);
        return oid ? [{ id: oid, odds: o.odds }] : [];
      });
    if (outcomes.length === 0) continue;
    out.push({ market_id: id, specifier: text(m.specifier), outcomes });
  }
  return out;
}

/** One event, or null when it is missing anything the matcher relies on. */
export function readEvent(raw: ApiEvent, tournamentId?: string): SportyBetEvent | null {
  const eventId = text(raw.eventId);
  const homeName = text(raw.homeTeamName);
  const awayName = text(raw.awayTeamName);
  const kickoff = Number(raw.estimateStartTime);
  if (!eventId || !/^sr:match:\d+$/.test(eventId) || !homeName || !awayName) return null;
  if (!Number.isFinite(kickoff) || kickoff <= 0) return null;
  return {
    eventId,
    homeName,
    awayName,
    kickoff,
    markets: readMarkets(raw.markets),
    homeId: text(raw.homeTeamId) ?? undefined,
    awayId: text(raw.awayTeamId) ?? undefined,
    tournamentId,
  };
}

export interface UpcomingPage {
  events: SportyBetEvent[];
  /** Events SportyBet says match the query, across every page. */
  totalNum: number;
}

/** A pcUpcomingEvents response, or null when it is not a success. */
export function parseUpcoming(body: unknown): UpcomingPage | null {
  const data = okData(body);
  if (!data) return null;
  const tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
  const events: SportyBetEvent[] = [];
  for (const t of tournaments as { id?: unknown; events?: ApiEvent[] }[]) {
    const tournamentId = text(t?.id) ?? undefined;
    for (const raw of t?.events ?? []) {
      const event = readEvent(raw, tournamentId);
      if (event) events.push(event);
    }
  }
  const totalNum = Number(data.totalNum);
  return { events, totalNum: Number.isFinite(totalNum) ? totalNum : events.length };
}

export interface TournamentEntry {
  id: string;
  name: string;
  category: string;
  eventSize: number;
}

/** A sportList response flattened to its tournaments, for suggesting league ids. */
export function parseTournamentList(body: unknown): TournamentEntry[] {
  const b = body as { bizCode?: unknown; data?: unknown } | null;
  if (!b || b.bizCode !== BIZ_OK || !Array.isArray(b.data)) return [];
  const out: TournamentEntry[] = [];
  for (const sport of b.data as { categories?: { name?: unknown; tournaments?: unknown[] }[] }[]) {
    for (const category of sport.categories ?? []) {
      for (const t of (category.tournaments ?? []) as { id?: unknown; name?: unknown; eventSize?: unknown }[]) {
        const id = text(t.id);
        const name = text(t.name);
        if (!id || !name) continue;
        out.push({ id, name, category: text(category.name) ?? "", eventSize: Number(t.eventSize) || 0 });
      }
    }
  }
  return out;
}

/** The request body for POST /orders/share. */
export function shareRequest(selections: readonly BookSelection[]) {
  return {
    selections: selections.map((s) => ({
      eventId: s.eventId,
      marketId: s.marketId,
      specifier: s.specifier ?? null,
      outcomeId: s.outcomeId,
    })),
  };
}

/**
 * A share-code response (POST /orders/share, or GET /orders/share/{code}),
 * or null when it is not a usable booking.
 *
 * Refused when SportyBet reports any selection unavailable, or carries fewer
 * than were sent: a code that quietly lost a leg is not the slip the user
 * built, the same rule readBooking applies to parse.bot's answer. Without
 * `sent` (reading a code back) the count is reported, not checked.
 */
export function parseShareResponse(body: unknown, sent?: number): BookedCode | null {
  const data = okData(body);
  if (!data) return null;
  const code = text(data.shareCode);
  if (!code || !/^[A-Z0-9]{4,12}$/i.test(code)) return null;
  const deadline = Number(data.deadline);
  if (!Number.isFinite(deadline) || deadline <= 0) return null;
  if (Array.isArray(data.unavailableOutcomes) && data.unavailableOutcomes.length > 0) return null;

  const ticket = data.ticket as { selections?: unknown[] } | undefined;
  const count = Array.isArray(ticket?.selections)
    ? ticket.selections.length
    : Array.isArray(data.outcomes)
      ? data.outcomes.length
      : NaN;
  if (sent === undefined ? !Number.isInteger(count) : count !== sent) return null;

  return {
    bookingCode: code.toUpperCase(),
    shareUrl: text(data.shareURL)?.replace(/^http:/, "https:") ?? null,
    deadline,
    selectionsCount: count,
  };
}

/** The link that opens a code on SportyBet Nigeria. */
export function shareLink(code: string): string {
  return `https://www.sportybet.com/ng/?shareCode=${encodeURIComponent(code)}`;
}

/**
 * SportyBet's statuses for a game that is over: 3 once it has ended, 4 once
 * settled. Both read "Ended"; a game a day or two old can still be at 3.
 */
const ENDED = new Set([3, 4]);

/** A finished (or called-off) game as SportyBet records it. */
export interface EventResult {
  eventId: string;
  /** Final score as SportyBet shows it, "home:away". Null when called off. */
  setScore: string | null;
  /** Per-half scores, regulation first; anything after is extra time. */
  halves: string[];
  /** Cancelled, postponed or abandoned: there is no score to check. */
  void: boolean;
}

function readResult(raw: Record<string, unknown>): EventResult | null {
  const eventId = text(raw.eventId);
  if (!eventId || !/^sr:match:\d+$/.test(eventId)) return null;
  const status = text(raw.matchStatus) ?? "";
  if (/cancel|postpon|abandon|interrupt/i.test(status)) {
    return { eventId, setScore: null, halves: [], void: true };
  }
  if (!ENDED.has(raw.status as number) && !/^ended$/i.test(status)) return null;
  const setScore = text(raw.setScore);
  if (!setScore || !SCORE.test(setScore)) return null;
  const halves = Array.isArray(raw.gameScore)
    ? raw.gameScore.filter((s): s is string => typeof s === "string" && SCORE.test(s))
    : [];
  return { eventId, setScore, halves, void: false };
}

const SCORE = /^\d+:\d+$/;

/** An eventResultList response: the ended (or called-off) games in it. */
export function parseResults(body: unknown): EventResult[] {
  const data = okData(body);
  if (!data) return [];
  const out: EventResult[] = [];
  for (const t of (Array.isArray(data.tournaments) ? data.tournaments : []) as { events?: unknown[] }[]) {
    for (const raw of t?.events ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const result = readResult(raw as Record<string, unknown>);
      if (result) out.push(result);
    }
  }
  return out;
}

/** A single event's detail response, as a result once the game is over. */
export function parseEventResult(body: unknown): EventResult | null {
  const data = okData(body);
  return data ? readResult(data) : null;
}

const goals = (score: string) => score.split(":").map(Number) as [number, number];

/**
 * Whether SportyBet's final score for the event agrees with ours.
 *
 * Compared with SportyBet's final score first, then with the two regulation
 * halves summed: in a cup tie one side may record the score after extra time
 * and the other the score at ninety minutes, and that is the same game.
 */
export function scoreVerdict(ours: { home: number; away: number }, theirs: EventResult): "confirmed" | "mismatch" {
  const same = (s: string) => {
    const [h, a] = goals(s);
    return h === ours.home && a === ours.away;
  };
  if (theirs.setScore && same(theirs.setScore)) return "confirmed";
  if (theirs.halves.length >= 2) {
    const [h1, a1] = goals(theirs.halves[0]);
    const [h2, a2] = goals(theirs.halves[1]);
    if (same(`${h1 + h2}:${a1 + a2}`)) return "confirmed";
  }
  return "mismatch";
}
