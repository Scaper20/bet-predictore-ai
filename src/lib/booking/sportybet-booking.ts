import "server-only";

import { chromium, type Page } from "playwright";
import type { SportyBetSelectionAddress } from "@/lib/odds/sportybet";

/**
 * Real SportyBet "booking codes", produced by driving the live sportybet.com
 * bet-slip UI with a headless browser.
 *
 * This is a fundamentally different act from everything else in src/lib/odds:
 * that code READS SportyBet's board through parse.bot, a paid data
 * marketplace that exists precisely so nobody here has to touch SportyBet's
 * own infrastructure directly. A booking code has no such marketplace —
 * producing one means anonymously using SportyBet's own public bet-slip
 * builder the way a visitor's browser would, then reading back the code it
 * shows.
 *
 * That is very likely a breach of SportyBet's terms of service even though no
 * login or funds are involved — this repo tried a much more conservative
 * version of this idea before (see the removed src/components/slip/quick-slip.tsx
 * and src/lib/bookmakers/* in git history) and reversed it for exactly that
 * reason. Enabling SPORTYBET_BOOKING_ENABLED is a business decision to accept
 * that risk, not a technical one, and it is off by default.
 *
 * Two rules this file will not break, whatever it takes to get a booking
 * working reliably:
 *
 *   1. No anti-bot evasion. If SportyBet's frontend shows a challenge page,
 *      a CAPTCHA, or anything else meant to stop automation, that is a stop
 *      signal, not an obstacle to route around. This never installs stealth
 *      plugins, spoofs a fingerprint, solves a CAPTCHA or rotates IPs to dodge
 *      a block.
 *   2. Fail closed. Every stage that can fail resolves to `{ code: null,
 *      reason }` rather than throwing or inventing a code. A wrong booking
 *      code — one that loads a different slip than the user thinks they are
 *      staking — is worse than no code, the same principle match-fixture.ts
 *      applies to prices.
 *
 * SITE INTEGRATION NOTE: the URL pattern and selectors below were written
 * without a live browser session against sportybet.com — this environment has
 * no way to render and inspect its JS-driven UI. They are the best guess from
 * how a Betradar-fed sportsbook frontend is typically built (ids surfaced as
 * data attributes, since that is how the frontend's own click handlers find
 * what was clicked), but MUST be verified and corrected against the real site
 * before this is relied on. Until then, every call will most likely resolve
 * to `{ code: null, reason: "not_found" }` — which is the fail-closed default
 * working exactly as intended, not a crash.
 */

/** One selection to add to the slip, addressed the way SportyBet addresses it. */
export interface BookingLeg extends SportyBetSelectionAddress {
  /** For error messages only — never used to find or click anything. */
  label: string;
}

export type BookingReason = "disabled" | "no_legs" | "blocked" | "timeout" | "not_found" | "error";

export type BookingResult = { code: string } | { code: null; reason: BookingReason };

function configured(): boolean {
  return (process.env.SPORTYBET_BOOKING_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * One browser session at a time, with a floor on how close together sessions
 * may run.
 *
 * A booking code is a write against SportyBet's own systems, not a read, so
 * this is deliberately far more conservative than the odds cache's approach
 * to concurrency — whatever the caller's own concurrency looks like (several
 * users booking slips at once), SportyBet sees one visitor at a time, spaced
 * out, never a burst.
 */
const MIN_GAP_MS = 4_000;
let queue: Promise<unknown> = Promise.resolve();
let lastRunAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRunAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastRunAt = Date.now();
    }
  });
  // Keep the chain alive even when a session fails, or every booking after
  // the first failure would wait on a promise that never resolves.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** How long a result is worth trusting before asking SportyBet again. */
function ttlFor(result: BookingResult): number {
  if (result.code !== null) return 10 * 60_000; // a produced code names a fixed slip; it doesn't go stale in minutes
  if (result.reason === "blocked") return 5 * 60_000; // back off hard from a block rather than retry into it
  return 60_000; // any other miss may just be a timing fluke worth retrying soon
}

interface CacheEntry {
  result: BookingResult;
  expiresAt: number;
}

const resultCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<BookingResult>>();

/** Low-traffic, gated feature — this is a guard against unbounded growth, not a tuned limit. */
const MAX_CACHE_ENTRIES = 200;

function rememberResult(key: string, result: BookingResult) {
  resultCache.set(key, { result, expiresAt: Date.now() + ttlFor(result) });
  if (resultCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = resultCache.keys().next().value;
  if (oldest !== undefined) resultCache.delete(oldest);
}

/** Order-independent, so the same slip added in a different order still hits cache. */
function signature(legs: BookingLeg[]): string {
  return legs
    .map((leg) => `${leg.eventId}:${leg.marketId}:${leg.outcomeId}:${leg.specifier ?? ""}`)
    .sort()
    .join(",");
}

const SITE = {
  base: "https://www.sportybet.com/ng",
  matchPath: (eventId: string) => `/sport/football/sr:match:${eventId.replace(/^sr:match:/, "")}`,
  /** Tried in order; the first that matches anything on the page wins. */
  outcomeSelectors: (leg: BookingLeg) => [
    `[data-market-id="${leg.marketId}"][data-outcome-id="${leg.outcomeId}"]`,
    `[data-market="${leg.marketId}"][data-outcome="${leg.outcomeId}"]`,
  ],
  slipDrawerSelector: '[data-testid="bet-slip"], .betslip, #betslip',
  shareButtonSelectors: ['[data-testid="share-bet"]', 'button:has-text("Share")', 'button:has-text("Book")'],
  codeSelectors: ['[data-testid="booking-code"]', ".booking-code", ".share-code"],
  /** Text that means "automated access was noticed and refused" — stop, don't push through it. */
  blockedMarkers: [/verify you are human/i, /access denied/i, /captcha/i, /checking your browser/i, /cloudflare/i],
} as const;

function looksBlocked(bodyText: string | null): boolean {
  if (!bodyText) return false;
  return SITE.blockedMarkers.some((pattern) => pattern.test(bodyText));
}

async function clickOutcome(page: Page, leg: BookingLeg): Promise<boolean> {
  for (const selector of SITE.outcomeSelectors(leg)) {
    const locator = page.locator(selector).first();
    const found = await locator.count().catch(() => 0);
    if (found > 0) {
      await locator.click({ timeout: 5_000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function openSlipAndReadCode(page: Page): Promise<string | null> {
  await page
    .locator(SITE.slipDrawerSelector)
    .first()
    .waitFor({ timeout: 8_000 })
    .catch(() => {});

  for (const selector of SITE.shareButtonSelectors) {
    const button = page.locator(selector).first();
    const found = await button.count().catch(() => 0);
    if (found > 0) {
      await button.click({ timeout: 5_000 }).catch(() => {});
      break;
    }
  }

  for (const selector of SITE.codeSelectors) {
    const text = await page
      .locator(selector)
      .first()
      .textContent({ timeout: 5_000 })
      .catch(() => null);
    const code = text?.trim();
    // SportyBet's real codes are short alphanumeric strings. Anything outside
    // that shape is more likely stray page text a loose selector picked up
    // than an actual code, and returning it would hand a user something that
    // fails when they type it in.
    if (code && /^[A-Za-z0-9]{4,12}$/.test(code)) return code;
  }
  return null;
}

async function runBooking(legs: BookingLeg[]): Promise<BookingResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext()).newPage();

    for (const leg of legs) {
      await page.goto(`${SITE.base}${SITE.matchPath(leg.eventId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });

      if (looksBlocked(await page.textContent("body").catch(() => null))) {
        return { code: null, reason: "blocked" };
      }

      if (!(await clickOutcome(page, leg))) {
        return { code: null, reason: "not_found" };
      }
    }

    const code = await openSlipAndReadCode(page);
    return code ? { code } : { code: null, reason: "not_found" };
  } catch (err) {
    if (err instanceof Error && /timeout/i.test(err.message)) return { code: null, reason: "timeout" };
    return { code: null, reason: "error" };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * A real SportyBet booking code for this exact set of selections, or a reason
 * it could not be produced.
 *
 * Never throws — every failure mode is a value in BookingReason, the same
 * "everything degrades to an answer, never an exception" convention as
 * sportyBetPrice. Callers should present any non-code result as "booking
 * unavailable right now", not as an error.
 */
export async function getSportyBetBookingCode(legs: BookingLeg[]): Promise<BookingResult> {
  if (!configured()) return { code: null, reason: "disabled" };
  if (legs.length === 0) return { code: null, reason: "no_legs" };

  const key = signature(legs);

  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = enqueue(() => runBooking(legs))
    .then((result) => {
      rememberResult(key, result);
      return result;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}
