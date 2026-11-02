/**
 * Which marketing channel a new account came from, as one word for Mixpanel's
 * acquisition_channel: partner, ads, social, organic_search, referral, direct.
 *
 * Read from the first-touch cookie (src/proxy.ts, lib/first-touch.ts) and the
 * partner link, the same two things lib/signup-source.ts saves to the profile.
 * Pure, so it can be tested without a request.
 */

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave)\./i;
const SOCIAL =
  /(^|\.)(facebook|fb|instagram|t|twitter|x|tiktok|youtube|whatsapp|wa|telegram|t\.me|linkedin|reddit|snapchat|pinterest)\./i;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid_social|display|ads?|banner|cpm)$/i;

interface Touch {
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
}

export function parseTouch(raw: string | null | undefined): Touch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Touch;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function acquisitionChannel(firstTouch: string | null | undefined, partnerRef: string | null | undefined): string {
  if (partnerRef) return "partner";
  const t = parseTouch(firstTouch);
  if (!t) return "direct";
  const medium = (t.utmMedium ?? "").trim();
  if (PAID_MEDIUM.test(medium)) return "ads";
  const source = (t.utmSource ?? "").trim().toLowerCase();
  const host = (t.referrerHost ?? "").trim().toLowerCase();
  if (medium.toLowerCase() === "email" || source === "email" || source === "newsletter") return "email";
  if (medium.toLowerCase() === "social" || (source && SOCIAL.test(`${source}.`)) || (host && SOCIAL.test(`${host}.`))) return "social";
  if (medium.toLowerCase() === "organic" || (host && SEARCH.test(`${host}.`))) return "organic_search";
  if (host || source) return "referral";
  return "direct";
}
