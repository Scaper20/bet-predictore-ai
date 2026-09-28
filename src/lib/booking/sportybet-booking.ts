import "server-only";

import { chromium, type Browser, type Page } from "playwright-core";
import sparticuzChromium from "@sparticuz/chromium";
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
 * SITE INTEGRATION NOTE: partially verified, not fully. This environment
 * cannot render sportybet.com itself (its outbound TLS is intercepted by a
 * policy proxy that headless Chromium doesn't trust, and working around that
 * would mean digging into the system certificate store, which this session
 * deliberately didn't do), so everything below came from screenshots a
 * person walked through by hand rather than this file browsing it directly.
 * Confirmed so far: booking needs no SportyBet login at all; the trigger is a
 * button labelled exactly "Book Bet" (`shareButtonSelectors`); the result
 * screen shows the code under a literal "Booking Code" label
 * (`codeLabelPattern`); and for the 1X2 market specifically, the market list
 * carries a row labelled exactly "1X2" with Home/Draw/Away cells that
 * `click1x2ByLabel` targets by that same wording.
 *
 * Still unverified: every OTHER market family (double chance, btts, totals)
 * has no visual confirmation at all and falls through to the plain
 * data-attribute guess in `outcomeSelectors`, and even the confirmed 1X2 path
 * assumes a document structure (the row label appearing before its own price
 * cells, nothing else with that exact wording between them) that was inferred
 * rather than seen directly. `{ code: null, reason: "not_found" }` on a
 * booking that isn't plain 1X2 is the expected, fail-closed result of that
 * gap — not a crash.
 *
 * RUNTIME NOTE: launched through playwright-core rather than the full
 * playwright package, which bundles its own multi-hundred-megabyte browser
 * download — far past what fits in a Vercel serverless function alongside
 * the rest of this app. On Vercel (and anywhere else that looks like AWS
 * Lambda, which Vercel's Node functions run on), the browser instead comes
 * from @sparticuz/chromium, a build compressed and packaged specifically to
 * survive that environment. That is a genuinely different Chromium build
 * than Playwright's own — officially, Playwright only supports the browser
 * it downloads itself — so this counts on the CDP-level automation this file
 * does (navigate, click, read text) being basic enough not to need
 * Playwright's own patches. Locally, or on a plain Node server, it falls
 * back to whatever `npx playwright install chromium` already put on disk.
 */

function isServerlessRuntime(): boolean {
  // Vercel's own Node functions run on AWS Lambda, and set both. A local dev
  // machine or a self-hosted Node server sets neither.
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessRuntime()) {
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }
  return chromium.launch({ headless: true });
}

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
  // The mobile site rather than the desktop React app — simpler markup,
  // more likely to be server-rendered, and where this was pointed to test
  // against. Still unverified past this base URL: see the SITE INTEGRATION
  // NOTE above.
  base: "https://www.sportybet.com/ng/m",
  matchPath: (eventId: string) => `/sport/football/sr:match:${eventId.replace(/^sr:match:/, "")}`,
  /** Tried in order; the first that matches anything on the page wins. */
  outcomeSelectors: (leg: BookingLeg) => [
    `[data-market-id="${leg.marketId}"][data-outcome-id="${leg.outcomeId}"]`,
    `[data-market="${leg.marketId}"][data-outcome="${leg.outcomeId}"]`,
  ],
  slipDrawerSelector: '[data-testid="bet-slip"], .betslip, #betslip',
  /**
   * Confirmed from a real screenshot of the bet slip: the button is labelled
   * "Book Bet" (green, sits beside a separate "Place Bet" button — the two
   * are not interchangeable, so this matches the specific label rather than
   * a bare "Book" that could equally hit the wrong one on a differently
   * laid-out page).
   */
  shareButtonSelectors: ['button:has-text("Book Bet")', '[data-testid="share-bet"]', 'button:has-text("Share")'],
  /**
   * Confirmed from a real screenshot of the result screen (a person walked
   * through the flow and shared it): the code renders as its own line right
   * under the literal label "Booking Code" — e.g. "Booking Code" then
   * "H9BKLD" — not under any particular CSS class this file could see.
   * codeLabelPattern matches that shape directly against the page's own
   * rendered text, which is why openSlipAndReadCode tries it before falling
   * back to the still-unverified CSS guesses in codeSelectors below.
   */
  codeLabelPattern: /Booking Code\s*\n?\s*([A-Za-z0-9]{4,10})\b/,
  codeSelectors: ['[data-testid="booking-code"]', ".booking-code", ".share-code"],
  /** Text that means "automated access was noticed and refused" — stop, don't push through it. */
  blockedMarkers: [/verify you are human/i, /access denied/i, /captcha/i, /checking your browser/i, /cloudflare/i],
} as const;

function looksBlocked(bodyText: string | null): boolean {
  if (!bodyText) return false;
  return SITE.blockedMarkers.some((pattern) => pattern.test(bodyText));
}

/** Betradar's 1X2 outcome ids, same mapping as markets.ts's ONE_X_TWO, reversed to the word the page shows. */
const ONE_X_TWO_LABEL: Record<string, string> = { "1": "Home", "2": "Draw", "3": "Away" };

/**
 * 1X2 specifically, matched by the words on the page rather than a guessed
 * class or data attribute.
 *
 * Confirmed from real screenshots: the market list carries a row whose
 * label is exactly "1X2" — distinct from the "1X2 - 1UP" / "1X2 - 2UP"
 * boosted variants sitting next to it, which are different products at
 * different prices, the same trap markets.ts's own comment warns about for
 * the odds side of this — and clicking under it produces a slip that names
 * the outcome by exactly the word this looks for ("Home"). Still not fully
 * verified: the document structure between that row and its price cells
 * wasn't visible in what was shared, so this walks forward in document
 * order from the row label rather than assuming a specific parent/child
 * shape, and can still miss if the real layout doesn't put them in that
 * order. Every other market family (double chance, btts, totals) has no
 * visual confirmation at all yet and relies entirely on the plain
 * data-attribute guess in outcomeSelectors below.
 */
async function click1x2ByLabel(page: Page, leg: BookingLeg): Promise<boolean> {
  if (leg.marketId !== "1") return false;
  const label = ONE_X_TWO_LABEL[leg.outcomeId];
  if (!label) return false;

  // Anchored so this can't accidentally match "1X2 - 1UP" or "1X2 - 2UP".
  const row = page.getByText(/^1X2$/).first();
  if (!(await row.count().catch(() => 0))) return false;

  const cell = row.locator(`xpath=following::*[normalize-space(text())="${label}"][1]`).first();
  if (!(await cell.count().catch(() => 0))) return false;

  await cell.click({ timeout: 5_000 }).catch(() => {});
  return true;
}

async function clickOutcome(page: Page, leg: BookingLeg): Promise<boolean> {
  if (await click1x2ByLabel(page, leg).catch(() => false)) return true;

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

  const bodyText = await page.textContent("body").catch(() => null);
  const labelled = bodyText?.match(SITE.codeLabelPattern)?.[1];
  if (labelled) return labelled;

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
  // Declared outside the try, but launched INSIDE it — a launch failure (a
  // bad deploy, a missing binary, a cold-start extraction glitch) is exactly
  // the kind of thing this function promises to fail closed on, and it can
  // only keep that promise if the call that can fail is where the catch can
  // see it.
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
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
    // The fail-closed contract means the caller only ever sees "unavailable"
    // — but that's worthless for actually fixing a break unless the real
    // cause lands somewhere. This is that somewhere: Vercel (and any other
    // Node host) captures console.error into the function's own logs, no
    // separate log-querying tool required.
    console.error("[sportybet-booking] booking run failed:", err);
    if (err instanceof Error && /timeout/i.test(err.message)) return { code: null, reason: "timeout" };
    return { code: null, reason: "error" };
  } finally {
    await browser?.close().catch(() => {});
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
