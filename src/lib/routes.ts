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
  forYou: "for-you",
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
 * Where a session starts when the user did not ask for anywhere specific.
 *
 * Sign-up, sign-in and the end of onboarding all land here. For You is the
 * page the questionnaire exists to fill, so finishing onboarding and arriving
 * anywhere else makes the questions look like paperwork.
 *
 * This is only the fallback. A `next` carried through the flow — from a gate
 * on a match page, say — still wins, and must: sending someone to their feed
 * instead of back to the thing they were reading is the same bug in a nicer
 * outfit.
 */
export const POST_AUTH_DESTINATION = sportPath("forYou");

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
