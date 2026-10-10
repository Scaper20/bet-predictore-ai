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

/**
 * Content-Security-Policy: what the browser may load and talk to, so a
 * script injected into a page (XSS) can't pull in attacker code or ship data
 * to an attacker's server.
 *
 * Without nonces, deliberately. A nonce needs every page rendered per request
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
 * and these pages are static. So `script-src` has to allow 'unsafe-inline' for
 * Next's own bootstrap and the two small scripts in the root layout; the
 * value is in the other directives, which are all locked down.
 *
 * - img-src allows any https host: Crest renders team logos from whichever
 *   host the data provider returns, and those hosts change.
 * - connect-src is this origin plus the Supabase project (REST and
 *   realtime). Server-side calls to the data and payment APIs never pass
 *   through the browser, so they aren't listed.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV === "development";
  const supabase = safeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const connect = ["'self'"];
  if (supabase) connect.push(supabase, supabase.replace(/^https:/, "wss:"));
  if (dev) connect.push("ws://localhost:*", "https://va.vercel-scripts.com");

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function safeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const { protocol, origin } = new URL(value);
    return protocol === "https:" ? origin : null;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" tells a scanner which framework's exploits to try.
  poweredByHeader: false,

  async headers() {
    const securityHeaders = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy() },
      // Isolates this site's window from pages that open it; allow-popups
      // keeps the OAuth and payment pop-ups working.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
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
      /*
       * The service worker must never be cached by the browser or a CDN, or a
       * fix to it could take days to reach installed phones. The CSP keeps it
       * from loading anything but this origin's own scripts.
       */
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      /*
       * The dev deployment (kiqstat-dev.vercel.app) and every preview URL serve
       * the same pages as www.kiqstat.app. Left indexable they compete with
       * production as duplicate content, so any *.vercel.app host is noindex.
       */
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<sub>.+)\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },

  async redirects() {
    return [
      /*
       * The earlier addresses (BetriX, then the .com.ng KiqStat domain) and the
       * bare kiqstat.app all land on www.kiqstat.app, keeping the path, so old
       * links, shared slips and search results carry over. Vercel's domain
       * settings already redirect these hosts; this is the fallback if one is
       * ever attached without a redirect. The target must stay the host Vercel
       * serves (www): pointing it at the bare domain, which Vercel sends to
       * www, would loop. /api is left alone: a webhook or pg_net request does
       * not follow a redirect.
       */
      ...["betrix.com.ng", "www.betrix.com.ng", "kiqstat.com.ng", "www.kiqstat.com.ng", "kiqstat.app"].map((host) => ({
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: host }],
        destination: "https://www.kiqstat.app/:path",
        permanent: true,
      })),
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
      // The coming-soon slugs of features that have shipped, for anyone who
      // bookmarked the placeholder.
      ...[
        ["results", "results"], ["tables", "tables"], ["h2h", "h2h"],
        ["team-form", "team-form"], ["goals-stats", "goals-stats"], ["ratings", "ratings"],
      ].map(([slug, route]) => ({ source: `/soon/${slug}`, destination: `/${DEFAULT_SPORT}/${route}`, permanent: true })),
      ...["how-it-works", "guides", "help"].map((slug) => ({ source: `/soon/${slug}`, destination: `/${slug}`, permanent: true })),
      ...["best-bets", "markets"].map((slug) => ({ source: `/soon/${slug}`, destination: `/${DEFAULT_SPORT}/predictions`, permanent: true })),
      { source: "/soon/blog", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
