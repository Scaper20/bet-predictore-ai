/**
 * Spending The Odds API's monthly allowance without running it dry.
 *
 * The free plan is 500 requests a month, and a request is charged per market
 * per region: asking ten leagues for 1X2 and totals across one region costs
 * twenty. That is a real constraint on a product that wants to show a price on
 * every match page, and getting it wrong is not a degraded feature -- it is
 * the feature silently dying on the 20th of the month with no way to buy it
 * back until the reset.
 *
 * The saving grace is that the API reports the truth in every response:
 * x-requests-remaining is authoritative, account-wide, and survives restarts,
 * process boundaries and deploys in a way an in-memory counter never could. So
 * this does not model the spend at all. It reads what the API says and stops
 * before zero.
 *
 * Pure, so the stopping rule can be tested without spending anything.
 */

/**
 * Credits held back and never spent by page traffic.
 *
 * Not superstition: hitting zero means the odds disappear from the product
 * entirely until the monthly reset, with no warning to anyone. A reserve keeps
 * enough to diagnose that state and to serve a manual check, and it converts a
 * cliff into a slow degradation -- pages stop refreshing consensus, cached
 * quotes keep rendering, and SportyBet's own price is unaffected because it is
 * a different provider on a different meter.
 */
export const QUOTA_RESERVE = 40;

export interface Quota {
  /** As last reported by the API. Null means never observed. */
  remaining: number | null;
  used: number | null;
  /** Epoch ms of the reading. */
  checkedAt: number;
}

export const UNKNOWN_QUOTA: Quota = { remaining: null, used: null, checkedAt: 0 };

/**
 * Read the quota out of a response's headers.
 *
 * Takes a getter rather than a Response so it can be tested, and because both
 * fetch's Headers and a plain record satisfy it.
 */
export function readQuota(get: (name: string) => string | null, now = Date.now()): Quota {
  const num = (name: string): number | null => {
    const raw = get(name);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    remaining: num("x-requests-remaining"),
    used: num("x-requests-used"),
    checkedAt: now,
  };
}

/**
 * Whether a call costing `cost` credits may go ahead.
 *
 * An unknown quota is allowed through exactly once in effect -- the first call
 * of a process has nothing to go on, and its response is what establishes the
 * reading. Refusing on unknown would mean the feature never starts.
 */
export function canSpend(quota: Quota, cost: number, reserve = QUOTA_RESERVE): boolean {
  if (quota.remaining === null) return true;
  return quota.remaining - cost >= reserve;
}

/**
 * How long a cached board should live, given what is left in the month.
 *
 * The alternative -- one fixed TTL -- has to be tuned for the worst case and
 * therefore serves stale prices all month to survive a spike that may never
 * come. Reading the remaining balance instead lets the cache be short while
 * there is room and stretch as the month tightens, which is the behaviour
 * anyone would choose by hand if they were watching the meter.
 *
 * The numbers: at two credits per league per refresh, a three-hour TTL across
 * ten leagues is roughly 160 credits a day if every league is viewed every
 * refresh, and twelve hours is roughly 40. Real traffic concentrates on a
 * handful of competitions, so these are ceilings rather than forecasts.
 */
export function refreshIntervalMs(quota: Quota): number {
  const HOUR = 60 * 60 * 1000;
  if (quota.remaining === null) return 6 * HOUR;
  if (quota.remaining > 300) return 3 * HOUR;
  if (quota.remaining > 150) return 6 * HOUR;
  return 12 * HOUR;
}

/**
 * What a request for these markets and regions will cost.
 *
 * The API's own rule, worth encoding rather than remembering: one credit per
 * market per region. Requesting two markets across two regions is four
 * credits, which is how a 500-credit month disappears in an afternoon.
 */
export function costOf(markets: readonly string[], regions: readonly string[]): number {
  return Math.max(1, markets.length * regions.length);
}
