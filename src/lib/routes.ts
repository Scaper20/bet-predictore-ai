import { DEFAULT_SPORT, isSportId, type SportId } from "@/lib/sports";

/**
 * Sport-scoped URLs, built in one place.
 *
 * Every data route now lives under a /[sport]/ segment, and hand-writing
 * "/football/fixtures" at ~40 call sites would recreate exactly the problem
 * the Container refactor just solved for widths — a path that cannot be
 * changed because it is forty things.
 *
 * Surfaces that sit above the segment and so have no param to read (the
 * footer renders in the (app) layout, above [sport]) pass nothing and get
 * DEFAULT_SPORT. That is correct while there is one sport and is the first
 * thing to revisit when there are two.
 */

export const SPORT_ROUTES = {
  live: "live",
  fixtures: "fixtures",
  predictions: "predictions",
  trends: "trends",
  trackRecord: "track-record",
  slip: "slip",
} as const;

export type SportRoute = keyof typeof SPORT_ROUTES;

export function sportPath(route: SportRoute, sport: SportId = DEFAULT_SPORT): string {
  return `/${sport}/${SPORT_ROUTES[route]}`;
}

export function matchPath(id: string, sport: SportId = DEFAULT_SPORT): string {
  return `/${sport}/match/${encodeURIComponent(id)}`;
}

/**
 * The active sport for a client component, read off the pathname.
 *
 * The header is the real caller: it renders above the [sport] segment so it
 * has no params, but it already calls usePathname() for its active-link state.
 */
export function sportFromPathname(pathname: string): SportId {
  const first = pathname.split("/")[1] ?? "";
  return isSportId(first) ? first : DEFAULT_SPORT;
}
