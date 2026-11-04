/**
 * The Picks page's filters as one path segment, for the cached copy that
 * signed-out visitors are served (src/proxy.ts rewrites to
 * /<sport>/predictions/s/<segment>).
 *
 * Edge-safe and dependency-free: it runs in the proxy. Only the five known
 * filters are kept, each value held to a short safe shape and written in a
 * fixed order, so every way of asking for the same view lands on the same
 * cached page and junk parameters can't mint new ones. The page itself
 * still validates the values (parsePickQuery).
 */

const KEYS = ["league", "family", "tier", "risk", "sort"] as const;
const VALUE = /^[a-z0-9-]{1,40}$/;
export const ALL_PICKS = "all";

export function pickSegment(params: URLSearchParams): string {
  const parts: string[] = [];
  for (const k of KEYS) {
    const v = params.get(k);
    if (v && VALUE.test(v)) parts.push(`${k}~${v}`);
  }
  return parts.length ? parts.join(".") : ALL_PICKS;
}

export function pickParams(segment: string): Partial<Record<(typeof KEYS)[number], string>> {
  const out: Partial<Record<(typeof KEYS)[number], string>> = {};
  if (segment === ALL_PICKS) return out;
  for (const part of segment.split(".")) {
    const [k, v] = part.split("~");
    if ((KEYS as readonly string[]).includes(k) && v && VALUE.test(v)) out[k as (typeof KEYS)[number]] = v;
  }
  return out;
}

/** The Picks page this proxy may serve from cache: /<sport>/predictions, exactly. */
export const PICKS_PATH = /^\/([a-z]+)\/predictions\/?$/;
