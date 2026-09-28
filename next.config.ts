import type { NextConfig } from "next";
import { DEFAULT_SPORT } from "./src/lib/sports";

/**
 * The data routes moved under a /[sport]/ segment. These are the old flat
 * URLs, which are indexed and linked to from outside, so they get permanent
 * redirects rather than 404s — `permanent: true` is a 308, which preserves
 * both the request method and the accumulated link equity.
 *
 * Query strings are carried across automatically, so /fixtures?league=npfl
 * lands on /football/fixtures?league=npfl intact.
 */
const MOVED = ["live", "fixtures", "predictions", "trends", "track-record", "slip"];

const nextConfig: NextConfig = {
  // playwright-core and @sparticuz/chromium both locate native binaries via
  // their own relative-path logic at runtime; letting the bundler pull them
  // into the server bundle breaks that resolution, so they're left external
  // and required through Node's normal module resolution instead. See
  // src/lib/booking/sportybet-booking.ts.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],

  /**
   * @sparticuz/chromium finds its own binaries (bin/chromium.br and friends,
   * ~67MB) by reading its own package directory at runtime rather than a
   * static `require`/`import`, which is exactly the pattern Next's file
   * tracer cannot follow — confirmed by building and checking the emitted
   * .nft.json for this route, which listed the package's few KB of JS and
   * silently dropped every .br binary. Without this, the deployed function
   * would launch fine locally (playwright-core falls back to a locally
   * installed browser off Vercel) and then fail closed with `{ code: null,
   * reason: "error" }` in production the moment it tried to actually spawn
   * Chromium — a gap that would only show up as a support ticket, not a
   * build failure. Scoped to the one route that needs it rather than every
   * function, since it doubles that function's deployed size.
   */
  outputFileTracingIncludes: {
    "/api/slip/booking-code": ["./node_modules/@sparticuz/chromium/bin/**"],
  },

  async headers() {
    const securityHeaders = [
      // Defense in depth: same intent as robots.txt's disallow and the
      // admin layout's `robots: { index: false }` metadata, but an HTTP
      // header a search engine or crawler can't miss by skipping robots.txt
      // or failing to parse the <meta> tag out of the rendered HTML.
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
    ];
  },

  async redirects() {
    return [
      ...MOVED.map((path) => ({
        source: `/${path}`,
        destination: `/${DEFAULT_SPORT}/${path}`,
        permanent: true,
      })),
      {
        source: "/match/:id",
        destination: `/${DEFAULT_SPORT}/match/:id`,
        permanent: true,
      },
      /*
       * /how-it-works is gone. It sent visitors to the track record rather
       * than 404ing them, because the page's job was to earn trust and the
       * settled record now does that job — with results rather than a formula.
       */
      {
        source: "/how-it-works",
        destination: `/${DEFAULT_SPORT}/track-record`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
