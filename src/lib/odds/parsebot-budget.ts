/**
 * The rules for spending parse.bot credits, kept pure so they can be tested
 * without spending any.
 *
 * parse.bot bills per call, by endpoint, and on the $30 plan a credit is
 * about three US cents. The two ways that goes wrong are both slow and
 * silent: page traffic calling the API on every render, and the same board
 * being fetched by every serverless instance separately. The answers are a
 * hard cap the app cannot talk its way past (the ledger, migration 0053), and
 * one shared copy of each board whose freshness follows how close its next
 * game is.
 */

/** What each endpoint costs, from parse.bot's own listing (snapshot 15). */
export const CREDIT_COST = {
  get_upcoming_events: 3,
  get_live_events: 2,
  get_sport_list: 2,
  get_event_odds: 2,
  get_virtual_football: 1,
  book_bet: 2,
  get_booking: 1,
} as const;

export type ParsebotEndpoint = keyof typeof CREDIT_COST;

/**
 * Endpoints the app may call at all.
 *
 * get_event_odds is two credits per fixture for markets the board already
 * carries; get_live_events, get_sport_list and get_virtual_football serve
 * nothing the product shows. get_booking is for checking a code by hand, not
 * for page traffic. Leaving them out means a stray call fails here rather
 * than on the bill.
 */
export const ALLOWED_ENDPOINTS: readonly ParsebotEndpoint[] = ["get_upcoming_events", "book_bet"];

export interface Caps {
  /** Most credits in one day, Lagos time. */
  daily: number;
  /** Most credits in any 30 days: the plan's size, so it cannot be overrun. */
  window: number;
}

/** Defaults for the 1,000-credit plan: a month's worth, spread evenly. */
export const DEFAULT_CAPS: Caps = { daily: 30, window: 1000 };

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Caps from the environment, falling back to the defaults on anything malformed. */
export function capsFrom(env: Record<string, string | undefined>): Caps {
  return {
    daily: positiveInt(env.PARSEBOT_DAILY_CREDITS, DEFAULT_CAPS.daily),
    window: positiveInt(env.PARSEBOT_WINDOW_CREDITS, DEFAULT_CAPS.window),
  };
}

/**
 * Whether live parse.bot calls are switched on at all.
 *
 * Three conditions, all required: the admin switch is on (app_switches,
 * flipped from /admin/parsebot), a key is set, and PARSEBOT_LIVE is not
 * "off". A key alone is not enough: it can sit in Vercel ready for launch
 * without a single credit being spent. PARSEBOT_LIVE=off is the hard stop
 * that no admin click can override, for when the key itself is in doubt.
 */
export function liveEnabled(env: Record<string, string | undefined>, switchedOn: boolean): boolean {
  return switchedOn && env.PARSEBOT_LIVE?.trim() !== "off" && Boolean(env.PARSEBOT_API_KEY?.trim());
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * How long a stored SportyBet board stays good enough to answer from.
 *
 * Prices move most in the last hours before kickoff and hardly at all three
 * days out, so a single TTL is either wasteful far out or stale close in.
 * Keyed to the board's next kickoff instead.
 *
 * Sized for the 1,000-credit plan, which is about 33 credits, or eleven
 * boards, a day. A competition only refreshes when someone asks for one of
 * its prices, so a quiet league costs nothing; a busy one on matchday costs
 * at most twelve boards (36 credits) at the two-hour rate, and the daily cap
 * stops it there.
 */
export function boardTtlMs(nextKickoff: number | null, now = Date.now()): number {
  // Nothing on the board: a competition between rounds. Look again tomorrow.
  if (nextKickoff === null) return 24 * HOUR;
  const until = nextKickoff - now;
  if (until <= 6 * HOUR) return 2 * HOUR;
  if (until <= 48 * HOUR) return 6 * HOUR;
  return 24 * HOUR;
}

/** The earliest kickoff still ahead of now, or null. */
export function nextKickoff(events: readonly { kickoff: number }[], now = Date.now()): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (e.kickoff > now && (best === null || e.kickoff < best)) best = e.kickoff;
  }
  return best;
}

/**
 * Oldest stored board that is still shown while live calls are off or the
 * budget is spent. Past this the price may have moved a long way, and "no
 * price" is the honest answer.
 */
export const MAX_STALE_MS = 24 * HOUR;

export type BoardDecision = "use" | "refresh" | "stale-ok" | "none";

/**
 * What to do with a stored board: use it, refresh it, or (when a refresh is
 * not possible) fall back to it if it is not too old.
 */
export function boardDecision(
  stored: { fetchedAt: number; events: readonly { kickoff: number }[] } | null,
  canFetch: boolean,
  now = Date.now(),
): BoardDecision {
  if (stored) {
    const age = now - stored.fetchedAt;
    if (age < boardTtlMs(nextKickoff(stored.events, now), now)) return "use";
    if (canFetch) return "refresh";
    return age < MAX_STALE_MS ? "stale-ok" : "none";
  }
  return canFetch ? "refresh" : "none";
}
