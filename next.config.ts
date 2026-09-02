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
