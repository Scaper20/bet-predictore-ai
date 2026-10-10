/**
 * Where a visitor is, for showing them their own kickoff times and prices.
 *
 * Most pages are cached and served to everyone alike (ISR), so the server
 * renders Nigeria's view (WAT, naira) and the browser swaps in the visitor's
 * own once it hydrates (lib/use-visitor.ts). Nothing here is trusted for
 * anything but display: checkout still decides the market server-side.
 */

/** ISO country code the proxy last saw the visitor connect from (Vercel's geo header). Not httpOnly: read by the browser. */
export const COUNTRY_COOKIE = "bx_country";

/** The view a page renders before it knows the visitor: Nigeria. */
export const DEFAULT_COUNTRY = "NG";
