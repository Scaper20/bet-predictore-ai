/**
 * Canonical site URL, used for metadata, sitemap/robots, and the Paystack
 * checkout callback.
 *
 * Deliberately does NOT fall back to a made-up placeholder domain — an
 * earlier version fell back to a domain nobody owned, which meant real
 * Paystack checkouts silently redirected to a domain-parking page whenever
 * NEXT_PUBLIC_SITE_URL wasn't set. Vercel auto-provides
 * NEXT_PUBLIC_VERCEL_URL (the actual current deployment's URL) on every
 * deployment, preview or production, so that's a real, reachable fallback
 * instead of a guess. Only pure local dev with no Vercel env falls through
 * to localhost, which is obviously wrong rather than plausibly-but-silently
 * wrong if it ever leaks into a build.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : undefined) ??
  "http://localhost:3000"
).replace(/\/$/, "");
