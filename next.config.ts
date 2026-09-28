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
   * Both packages here load part of themselves at runtime by reading their
   * own package directory rather than a static `require`/`import`, which is
   * exactly the pattern Next's file tracer cannot follow — confirmed twice
   * over by actually deploying and reading the runtime error, not just
   * assuming the config was enough:
   *
   *   - @sparticuz/chromium's binaries (bin/chromium.br and friends, ~67MB)
   *     were silently dropped from the trace, which would have failed
   *     closed with `{ code: null, reason: "error" }` the moment it tried to
   *     spawn Chromium.
   *   - playwright-core's own browsers.json — needed just to load the
   *     module, before any of this file's code runs — was ALSO dropped.
   *     That one doesn't fail closed: it throws at import time, outside any
   *     try/catch this file has, and surfaced in production as a raw 500
   *     ("Cannot find module '.../playwright-core/browsers.json'") rather
   *     than the graceful "booking unavailable" response. Given tracing
   *     already missed one file in this package, the whole package is
   *     included here rather than guessing which other files it reads the
   *     same way.
   *
   * Scoped to the one route that needs any of this rather than every
   * function, since it adds real size to whatever function carries it.
   */
  outputFileTracingIncludes: {
    "/api/slip/booking-code": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./node_modules/playwright-core/**",
    ],
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
