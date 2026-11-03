import { CANONICAL_ORIGIN } from "@/lib/site-url";

/**
 * Tags a link to our own site so a visit (and later a sign-up) can be traced
 * to the channel that carried it: first-touch (src/proxy.ts) stores the UTM
 * parameters, and the admin traffic page and Mixpanel group by them. Links we
 * hand out on WhatsApp, in emails and in shared combos used to arrive as
 * "direct".
 *
 * Only our own links are tagged; anything else is returned as it came. A tag
 * already on the link is never overwritten.
 */
export interface Utm {
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
}

export function utmUrl(url: string, utm: Utm): string {
  let u: URL;
  try {
    u = new URL(url, CANONICAL_ORIGIN);
  } catch {
    return url;
  }
  const own = new URL(CANONICAL_ORIGIN);
  const host = u.hostname.replace(/^www\./, "");
  if (host !== own.hostname.replace(/^www\./, "") && !u.hostname.endsWith("vercel.app")) return url;
  const set = (k: string, v: string | undefined) => {
    if (v && !u.searchParams.has(k)) u.searchParams.set(k, v);
  };
  set("utm_source", utm.source);
  set("utm_medium", utm.medium);
  set("utm_campaign", utm.campaign);
  set("utm_content", utm.content);
  // A bare origin reads better without the trailing slash URL adds.
  return u.pathname === "/" && !u.search && !u.hash ? u.origin : u.toString();
}
