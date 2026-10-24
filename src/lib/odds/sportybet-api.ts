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
  /** probability: SportyBet's own, which its Bet Builder pricing needs. */
  outcomes?: { id?: string | number; odds?: unknown; probability?: unknown }[];
}

/** A fixture on SportyBet: the board shape, plus the ids the matcher learns from. */
export interface SportyBetEvent extends FixtureLike {
  eventId: string;
  markets: RawMarket[];
  /** "sr:competitor:N". Absent on boards stored from parse.bot. */
  homeId?: string;
  awayId?: string;
  tournamentId?: string;
  /** "Primera LPF", and its category, "Argentina": for finding a competition's tournament. */
  tournamentName?: string;
  category?: string;
}

interface ApiOutcome {
  id?: unknown;
  odds?: unknown;
  probability?: unknown;
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
  sport?: { category?: { name?: unknown; tournament?: { id?: unknown; name?: unknown } } };
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
        return oid ? [{ id: oid, odds: o.odds, ...(o.probability !== undefined ? { probability: o.probability } : {}) }] : [];
      });
    if (outcomes.length === 0) continue;
    out.push({ market_id: id, specifier: text(m.specifier), outcomes });
  }
  return out;
}

/**
 * Every market listed on one event (GET /factsCenter/event), with SportyBet's
 * own probability on each outcome, or null when the answer is not one.
 * Measured: about 300 markets on a big game, against the 30-odd a board keeps.
 */
export function parseEventMarkets(body: unknown): RawMarket[] | null {
  const data = okData(body) as ApiEvent | null;
  if (!data || !Array.isArray(data.markets)) return null;
  return readMarkets(data.markets);
}

/** One event, or null when it is missing anything the matcher relies on. */
export function readEvent(raw: ApiEvent, tournamentId?: string, tournamentName?: string): SportyBetEvent | null {
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
    tournamentId: tournamentId ?? text(raw.sport?.category?.tournament?.id) ?? undefined,
    tournamentName: tournamentName ?? text(raw.sport?.category?.tournament?.name) ?? undefined,
    category: text(raw.sport?.category?.name) ?? undefined,
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
  for (const t of tournaments as { id?: unknown; name?: unknown; events?: ApiEvent[] }[]) {
    const tournamentId = text(t?.id) ?? undefined;
    const tournamentName = text(t?.name) ?? undefined;
    for (const raw of t?.events ?? []) {
      const event = readEvent(raw, tournamentId, tournamentName);
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
      ...(s.parentBetBuilderMarketId ? { parentBetBuilderMarketId: s.parentBetBuilderMarketId } : {}),
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

/**
 * The Bet Builder pricing call's body (POST /factsCenter/betBuilder/odds).
 * Each part is addressed by its Sportradar URN, "uof:<product>/<sport>/
 * <market>/<outcome>?<specifier>", product 3 being pre-match, and must carry
 * SportyBet's own odds and probability: without either it answers HTTP 500.
 */
export function builderRequest(eventId: string, parts: readonly { selection: BookSelection; odds: string; probability: string }[]) {
  return {
    eventId,
    selections: parts.map((p) => ({
      id: `uof:3/sr:sport:1/${p.selection.marketId}/${p.selection.outcomeId}?${p.selection.specifier ?? ""}`,
      odds: p.odds,
      probability: p.probability,
    })),
  };
}

export type BuilderQuote =
  | {
      valid: true;
      parentMarketId: string;
      odds: number;
      /** SportyBet's own chance of the parts landing together, when it says. */
      probability?: number;
    }
  | { valid: false };

/**
 * SportyBet's answer to a Bet Builder pricing call: the combined price and
 * the parent market id every part must carry on the share code, or valid:
 * false when the parts contradict each other (a home win and a draw). Null
 * when the answer is not one at all.
 */
export function parseBuilderQuote(body: unknown): BuilderQuote | null {
  const data = okData(body);
  if (!data) return null;
  if (data.valid !== true) return { valid: false };
  const parentMarketId = text(data.marketId);
  const odds = Number(data.odds);
  if (!parentMarketId || !Number.isFinite(odds) || odds <= 1) return { valid: false };
  const probability = Number(data.probability);
  return { valid: true, parentMarketId, odds, ...(probability > 0 && probability < 1 ? { probability } : {}) };
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

/** One selection on a shared code, with the game it is on, as SportyBet loads it. */
export interface TicketLeg {
  eventId: string;
  marketId: string;
  outcomeId: string;
  specifier?: string;
  /** Set on every part of a Bet Builder; the parts share it. */
  parentBetBuilderMarketId?: string;
  homeName: string | null;
  awayName: string | null;
  kickoff: number | null;
  tournamentId: string | null;
  /** SportyBet's own label for the pick, e.g. "Home & Over 2.5". */
  desc: string | null;
  /** SportyBet's name for the market, e.g. "Home Team Total Corners". */
  marketDesc: string | null;
  /** The price SportyBet quotes now (codes hold picks, not prices). */
  odds: number | null;
}

export interface Ticket {
  code: string;
  deadline: number | null;
  legs: TicketLeg[];
}

/**
 * A shared code read back in full (GET /orders/share/{code}): every
 * selection, joined to the game and current price SportyBet returns beside
 * it. Null for an invalid or expired code.
 */
export function parseShareTicket(body: unknown): Ticket | null {
  const data = okData(body);
  if (!data) return null;
  const code = text(data.shareCode);
  const ticket = data.ticket as { selections?: unknown[] } | undefined;
  if (!code || !Array.isArray(ticket?.selections) || ticket.selections.length === 0) return null;

  interface ApiTicketOutcome extends ApiEvent {
    markets?: (ApiMarket & { desc?: unknown; outcomes?: (ApiOutcome & { desc?: unknown })[] })[];
  }
  const outcomes = (Array.isArray(data.outcomes) ? data.outcomes : []) as ApiTicketOutcome[];
  const legs: TicketLeg[] = [];
  for (const raw of ticket.selections as Record<string, unknown>[]) {
    const eventId = text(raw.eventId);
    const marketId = text(raw.marketId) ?? (typeof raw.marketId === "number" ? String(raw.marketId) : null);
    const outcomeId = text(raw.outcomeId) ?? (typeof raw.outcomeId === "number" ? String(raw.outcomeId) : null);
    if (!eventId || !marketId || !outcomeId) continue;
    const specifier = text(raw.specifier) ?? undefined;
    // SportyBet returns one outcome entry per selection, carrying that
    // selection's own market and outcome; match on all four ids.
    const event = outcomes.find(
      (o) =>
        text(o.eventId) === eventId &&
        (o.markets ?? []).some(
          (m) =>
            String(m.id) === marketId &&
            (text(m.specifier) ?? undefined) === specifier &&
            (m.outcomes ?? []).some((x) => String(x.id) === outcomeId),
        ),
    );
    const market = event?.markets?.find((m) => String(m.id) === marketId && (text(m.specifier) ?? undefined) === specifier);
    const outcome = market?.outcomes?.find((x) => String(x.id) === outcomeId);
    const kickoff = Number(event?.estimateStartTime);
    const odds = Number(outcome?.odds);
    legs.push({
      eventId,
      marketId,
      outcomeId,
      ...(specifier ? { specifier } : {}),
      ...(text(raw.parentBetBuilderMarketId) ? { parentBetBuilderMarketId: text(raw.parentBetBuilderMarketId)! } : {}),
      homeName: text(event?.homeTeamName),
      awayName: text(event?.awayTeamName),
      kickoff: Number.isFinite(kickoff) && kickoff > 0 ? kickoff : null,
      tournamentId: text(event?.sport?.category?.tournament?.id),
      desc: text((outcome as { desc?: unknown } | undefined)?.desc),
      marketDesc: text(market?.desc),
      odds: Number.isFinite(odds) && odds > 1 ? odds : null,
    });
  }
  const deadline = Number(data.deadline);
  return legs.length ? { code: code.toUpperCase(), deadline: Number.isFinite(deadline) ? deadline : null, legs } : null;
}
