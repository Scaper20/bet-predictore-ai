import "server-only";

import { RateGate } from "@/lib/providers/http";
import { switchOn } from "@/lib/switches";
import type { BookedCode, BookSelection } from "./booking";
import {
  parseEventResult,
  parseResults,
  parseShareResponse,
  parseTournamentList,
  parseUpcoming,
  shareRequest,
  type EventResult,
  type SportyBetEvent,
  type TournamentEntry,
} from "./sportybet-api";

/**
 * SportyBet's own API, called directly: the free path for both boards and
 * booking codes. parse.bot stays as a fallback (sportybet.ts, booking-code.ts).
 *
 * This is the same JSON API the mobile site at sportybet.com/ng/m/ uses, so
 * nothing here drives a browser or parses HTML. It is fronted by CloudFront,
 * which refuses a request without a browser-like User-Agent with an HTML 403.
 * Any such refusal, a timeout, or a body that is not JSON is reported as null
 * and recorded, so callers fall back rather than fail, and the admin page can
 * say "blocked" instead of "no prices".
 *
 * Polite by construction: one shared request budget per instance, boards
 * stored once in public.odds_boards for every instance, and booking codes
 * cached by selection signature until their deadline.
 */

const BASE = "https://www.sportybet.com/api/ng";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-NG,en;q=0.9",
  Referer: "https://www.sportybet.com/ng/m/",
  Origin: "https://www.sportybet.com",
};

const TIMEOUT_MS = 8_000;

/** The markets our catalogue maps (markets.ts): 1X2, totals, double chance, BTTS, handicap. */
const MARKET_IDS = "1,18,10,29,16";

/**
 * Filtered by tournament, SportyBet pages ten events at a time whatever
 * pageSize says. Measured: pageSize=100 still returns ten.
 */
const TOURNAMENT_PAGE = 10;

/** Unfiltered pages hold whole tournaments, up to roughly this many events. */
const BOARD_PAGE = 99;

const gate = new RateGate("sportybet", 30, 6_000);

export interface DirectHealth {
  /** Epoch ms of the last successful call. */
  okAt: number | null;
  /** Epoch ms and reason of the last failure. */
  failedAt: number | null;
  reason: string | null;
}

const health: DirectHealth = { okAt: null, failedAt: null, reason: null };

/** This instance's view of whether SportyBet is answering. */
export function directHealth(): DirectHealth {
  return { ...health };
}

/**
 * Whether direct calls are allowed: the admin switch (public.app_switches,
 * on by default from migration 0066) and SPORTYBET_DIRECT not set to "off".
 */
export async function directEnabled(): Promise<boolean> {
  if (process.env.SPORTYBET_DIRECT?.trim() === "off") return false;
  return switchOn("sportybet_direct");
}

async function call(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<unknown | null> {
  if (!(await directEnabled())) return null;
  try {
    await gate.take();
  } catch {
    return null;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).catch((err: unknown) => {
      health.failedAt = Date.now();
      health.reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network";
      return null;
    });
    if (!response) return null;

    if (response.status === 429 || response.status >= 500) {
      if (response.status === 429) gate.pause(Number(response.headers.get("Retry-After")) || 30);
      health.failedAt = Date.now();
      health.reason = `http ${response.status}`;
      if (attempt === 0 && init.method !== "POST") {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return null;
    }

    const body = await response.json().catch(() => null);
    if (!response.ok || body === null) {
      // CloudFront's refusal is an HTML page with a 403.
      health.failedAt = Date.now();
      health.reason = response.status === 403 ? "blocked" : `http ${response.status}`;
      return null;
    }
    health.okAt = Date.now();
    return body;
  }
  return null;
}

function upcomingPath(page: number, pageSize: number, tournamentId?: string): string {
  const q = new URLSearchParams({
    sportId: "sr:sport:1",
    marketId: MARKET_IDS,
    pageSize: String(pageSize),
    pageNum: String(page),
    option: "1",
  });
  if (tournamentId) q.set("tournamentId", tournamentId);
  return `/factsCenter/pcUpcomingEvents?${q}`;
}

/**
 * Every upcoming event in one competition, markets attached, or null when
 * SportyBet could not be reached.
 *
 * Filtered pages are not a stable sort: measured on Serie A, two of twenty
 * events never appear on any filtered page, however often it is read. When
 * the filtered pages fall short of totalNum, the unfiltered board's leading
 * pages (where the big competitions sit) fill the gap.
 */
export async function fetchTournamentEvents(tournamentId: string): Promise<SportyBetEvent[] | null> {
  const byId = new Map<string, SportyBetEvent>();
  let total = 0;
  const maxPages = 12;
  for (let page = 1; page <= maxPages; page++) {
    const parsed = parseUpcoming(await call(upcomingPath(page, TOURNAMENT_PAGE, tournamentId)));
    if (!parsed) {
      if (page === 1) return null;
      break;
    }
    total = parsed.totalNum;
    for (const e of parsed.events) byId.set(e.eventId, e);
    if (parsed.events.length === 0 || page * TOURNAMENT_PAGE >= total) break;
  }

  if (byId.size < total) {
    for (let page = 1; page <= 3 && byId.size < total; page++) {
      const parsed = parseUpcoming(await call(upcomingPath(page, BOARD_PAGE)));
      if (!parsed || parsed.events.length === 0) break;
      for (const e of parsed.events) {
        if (e.tournamentId === tournamentId && !byId.has(e.eventId)) byId.set(e.eventId, e);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.kickoff - b.kickoff);
}

/** Every football tournament SportyBet lists, for suggesting league ids. */
export async function fetchTournamentList(): Promise<TournamentEntry[] | null> {
  const body = await call("/factsCenter/sportList?sportId=sr%3Asport%3A1&productId=3");
  return body === null ? null : parseTournamentList(body);
}

/**
 * Books the selections and returns the share code, or null.
 *
 * Not retried: a POST that timed out may still have booked, and a second
 * attempt would only make a second code. The caller's signature cache is
 * what stops repeats.
 */
export async function createShareCode(selections: readonly BookSelection[]): Promise<BookedCode | null> {
  const body = await call("/orders/share", { method: "POST", body: shareRequest(selections) });
  return parseShareResponse(body, selections.length);
}

/** Reads a code back as SportyBet will load it for the user, or null if it could not be read. */
export async function readShareCode(code: string): Promise<BookedCode | null> {
  if (!/^[A-Z0-9]{4,12}$/i.test(code)) return null;
  const body = await call(`/orders/share/${encodeURIComponent(code)}`);
  return parseShareResponse(body);
}

/** The widest window eventResultList accepts. Measured: a day works, two days is an error. */
const RESULT_WINDOW_MS = 86_400_000;

/**
 * Ended games in one competition between two times (epoch ms), or null when
 * SportyBet could not be reached.
 *
 * Asked a day at a time, since SportyBet refuses a wider window. The ids go
 * in with their colons as they are: this endpoint answers an encoded
 * "sr%3Asport%3A1" with an error, unlike the upcoming list.
 */
export async function fetchResults(tournamentId: string, from: number, to: number): Promise<EventResult[] | null> {
  if (!/^sr:tournament:\d+$/.test(tournamentId) || !(to > from)) return null;
  const byId = new Map<string, EventResult>();
  let answered = false;
  for (let start = Math.floor(from); start < to && start < from + 14 * RESULT_WINDOW_MS; start += RESULT_WINDOW_MS) {
    const end = Math.min(Math.floor(to), start + RESULT_WINDOW_MS);
    for (let page = 1; page <= 5; page++) {
      const body = await call(
        `/factsCenter/eventResultList?sportId=sr:sport:1&tournamentId=${tournamentId}` +
          `&startTime=${start}&endTime=${end}&pageNum=${page}&pageSize=100`,
      );
      if (body === null) break;
      answered = true;
      const results = parseResults(body);
      for (const r of results) byId.set(r.eventId, r);
      const total = Number((body as { data?: { totalNum?: unknown } }).data?.totalNum);
      if (results.length === 0 || !Number.isFinite(total) || page * 100 >= total) break;
    }
  }
  return answered ? [...byId.values()] : null;
}

/** One event's result once it is over; null while it is not, or unreachable. */
export async function fetchEventResult(eventId: string): Promise<EventResult | null> {
  if (!/^sr:match:\d+$/.test(eventId)) return null;
  return parseEventResult(await call(`/factsCenter/event?eventId=${eventId}&productId=3`));
}
