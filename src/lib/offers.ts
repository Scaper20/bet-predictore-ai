/**
 * Offers: a pass (Pro or VIP for a number of hours) at a price, aimed at one
 * audience, all edited from /admin/offers (table `offers`, 0087).
 *
 *   new_visitors  the popup for a visitor's first window_hours: the window
 *                 opens at the earlier of this browser's first visit
 *                 (FIRST_SEEN_COOKIE, set by src/proxy.ts) and the account's
 *                 creation. A browser that was here before the cookie
 *                 existed is stamped "0", a returning visitor with no
 *                 window; its owner still gets one by creating an account.
 *   free_members  a different popup for existing free members.
 *   email         only through the link in its campaign email, for
 *                 window_hours after that email went out.
 *
 * Client-safe: shapes, constants and window arithmetic, shared by the
 * popup, the checkout route and the grant. The server half is
 * offers-server.ts.
 */

export type OfferAudience = "new_visitors" | "free_members" | "email";
export const OFFER_AUDIENCES: { id: OfferAudience; label: string; detail: string }[] = [
  { id: "new_visitors", label: "New visitors", detail: "Popup in a visitor's or new account's first hours" },
  { id: "free_members", label: "Free members", detail: "Popup for existing free accounts" },
  { id: "email", label: "Email only", detail: "Reached only through its campaign email link" },
];

export interface Offer {
  id: string;
  slug: string;
  name: string;
  audience: OfferAudience;
  active: boolean;
  tier: "pro" | "vip";
  hours: number;
  priceNaira: number;
  compareNaira: number | null;
  windowHours: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxPerAccount: number;
  headline: string;
  subline: string | null;
  cta: string;
  perks: string[];
}

/** What the page is told about an offer: the copy and the price, nothing internal. */
export type PublicOffer = Pick<Offer, "slug" | "tier" | "hours" | "priceNaira" | "compareNaira" | "headline" | "subline" | "cta" | "perks" | "audience">;

export function publicOffer(o: Offer): PublicOffer {
  const { slug, tier, hours, priceNaira, compareNaira, headline, subline, cta, perks, audience } = o;
  return { slug, tier, hours, priceNaira, compareNaira, headline, subline, cta, perks, audience };
}

/** Where a visitor stands: an offer open to them (and until when), a pass running, or neither. */
export type OfferState =
  | { state: "offer"; offer: PublicOffer; deadline: string | null; signedIn: boolean }
  | { state: "active"; until: string; tier: "pro" | "vip" }
  | { state: "none" };

/** Epoch ms of this browser's first visit, or "0" for one that was here before it existed. */
export const FIRST_SEEN_COOKIE = "kq_seen";
/** The payments.plan of an offer checkout: "offer:<slug>". */
export const OFFER_PLAN_PREFIX = "offer:";
/** The Paystack reference prefix of an offer checkout, for the callback page. */
export const OFFER_REFERENCE_PREFIX = "kiqstat_pass_";
/** The new-visitor window when an offer doesn't set one. */
export const DEFAULT_WINDOW_HOURS = 24;

export const offerPath = (slug: string, recipient?: string) => `/offer/${slug}${recipient ? `?r=${recipient}` : ""}`;
export const offerCampaign = (slug: string): `offer:${string}` => `offer:${slug}`;
export const isOfferPlan = (plan: string | null | undefined) => typeof plan === "string" && plan.startsWith(OFFER_PLAN_PREFIX);

const HOUR = 3_600_000;

/** Parses the cookie value: a past epoch ms, or null (missing, "0", junk, or in the future). */
export function firstSeenFrom(raw: string | null | undefined, now = Date.now()): number | null {
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 && ms <= now ? ms : null;
}

/** When a new-visitor window closes, or null when there is no window at all. */
export function offerDeadline(firstSeenMs: number | null, accountCreatedMs: number | null, windowHours = DEFAULT_WINDOW_HOURS): number | null {
  const starts = [firstSeenMs, accountCreatedMs].filter((v): v is number => v !== null);
  if (starts.length === 0) return null;
  return Math.min(...starts) + windowHours * HOUR;
}

/** Whether an offer is switched on and inside its dates. */
export function offerLive(o: Pick<Offer, "active" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (!o.active) return false;
  if (o.startsAt && Date.parse(o.startsAt) > now) return false;
  if (o.endsAt && Date.parse(o.endsAt) <= now) return false;
  return true;
}

/** The earlier of two deadlines, either of which may be missing. */
export function earlier(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** When a pass bought now ends: stacked on a running pass of the same tier. */
export function passExpiry(hours: number, paidAt: Date, runningUntil: Date | null): Date {
  const from = runningUntil && runningUntil > paidAt ? runningUntil : paidAt;
  return new Date(from.getTime() + hours * HOUR);
}

/** "23h 14m", "9m", for the countdowns; days past 48 hours. */
export function formatLeft(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** "24 hours", "3 days", "1 week". */
export function durationLabel(hours: number): string {
  if (hours % 168 === 0) return hours === 168 ? "1 week" : `${hours / 168} weeks`;
  if (hours % 24 === 0 && hours > 24) return `${hours / 24} days`;
  return `${hours} hours`;
}

export const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;
export const tierName = (t: "pro" | "vip") => (t === "vip" ? "VIP" : "Pro");
