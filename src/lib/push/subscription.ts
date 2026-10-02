/**
 * Push subscription shapes and validation, shared by the browser code and the
 * API routes. Pure, so it can be tested and imported from either side.
 */

/** What a device can switch on or off for itself. */
export interface PushTopics {
  /** Today's picks, each morning. */
  picks: boolean;
  /** How yesterday's picks did, folded into the same morning notification. */
  results: boolean;
  /** VIP value-shift alerts. Stored for everyone, only ever sent to VIPs. */
  valueAlerts: boolean;
}

export const DEFAULT_TOPICS: PushTopics = { picks: true, results: true, valueAlerts: true };

/** The parts of a browser PushSubscription (its toJSON()) the server keeps. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Push services a subscription may point at.
 *
 * Every browser hands out an endpoint on its vendor's push service: Google's
 * for Chrome, Android, Samsung Internet, Opera and Brave; Mozilla's for
 * Firefox; Apple's for Safari and iPhone home-screen apps; Microsoft's for
 * Edge. Sending is an HTTPS POST from our server to whatever URL is stored,
 * so storing an arbitrary URL would let anyone make the crons call it.
 * Matched on the host or any subdomain of it.
 */
const PUSH_SERVICE_HOSTS = ["googleapis.com", "google.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (endpoint.length > 1024) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** A subscription from a request body, or null if anything is off about it. */
export function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = v.endpoint;
  const p256dh = v.keys?.p256dh;
  const auth = v.keys?.auth;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) return null;
  // Lengths match the table's CHECKs: a P-256 public key is 87 characters of
  // base64url and the auth secret 22, with slack for padding.
  if (typeof p256dh !== "string" || p256dh.length < 40 || p256dh.length > 200 || !BASE64URL.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length < 10 || auth.length > 100 || !BASE64URL.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Only the topics actually present as booleans; the rest stay as stored. */
export function parseTopics(value: unknown): Partial<PushTopics> {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: Partial<PushTopics> = {};
  for (const key of ["picks", "results", "valueAlerts"] as const) {
    if (typeof v[key] === "boolean") out[key] = v[key] as boolean;
  }
  return out;
}
