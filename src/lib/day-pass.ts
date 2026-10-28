/**
 * The VIP day pass: ₦500 for 24 hours of VIP, offered to new visitors and
 * new accounts for their first 24 hours, once per account.
 *
 * Client-safe: the constants and the window arithmetic, shared by the
 * offer on the page, the checkout route and the grant. The server half
 * (eligibility, the grant) is in day-pass-server.ts.
 *
 * Who counts as new: the offer window opens at the earlier of this
 * browser's first visit (FIRST_SEEN_COOKIE, set by src/proxy.ts) and the
 * account's creation, and stays open for OFFER_HOURS. A browser that was
 * here before the cookie existed is stamped "0" (a returning visitor, no
 * window); its owner still gets one by creating an account. Clearing
 * cookies only opens a window for an account created inside it, so the
 * real limit is one pass per account.
 */

export const DAY_PASS_PRICE_NAIRA = 500;
export const DAY_PASS_HOURS = 24;
export const OFFER_HOURS = 24;
/** The payments.plan value of a day-pass checkout. */
export const DAY_PASS_PLAN = "vip:day";
/** Epoch ms of this browser's first visit, or "0" for one that was here before it existed. */
export const FIRST_SEEN_COOKIE = "kq_seen";
/** Where the offer sends people: signs them in first, then checks out. */
export const DAY_PASS_PATH = "/vip/day-pass";

const HOUR = 3_600_000;

/** Parses the cookie value: a past epoch ms, or null (missing, "0", junk, or in the future). */
export function firstSeenFrom(raw: string | null | undefined, now = Date.now()): number | null {
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 && ms <= now ? ms : null;
}

/** When the offer closes, or null when there is no window at all. */
export function offerDeadline(firstSeenMs: number | null, accountCreatedMs: number | null): number | null {
  const starts = [firstSeenMs, accountCreatedMs].filter((v): v is number => v !== null);
  if (starts.length === 0) return null;
  return Math.min(...starts) + OFFER_HOURS * HOUR;
}

export function dayPassExpiry(paidAt: Date): Date {
  return new Date(paidAt.getTime() + DAY_PASS_HOURS * HOUR);
}

/** "23h 14m", "9m", for the countdowns. */
export function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** What the offer UI shows. */
export type DayPassState =
  | { state: "offer"; deadline: string; signedIn: boolean }
  | { state: "active"; until: string }
  | { state: "none" };
