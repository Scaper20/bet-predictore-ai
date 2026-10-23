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
  predictions: "predictions",
  trends: "trends",
  trackRecord: "track-record",
  slip: "combo",
  trackedSlips: "combo/tracked",
  forge: "forge",
  codeHub: "code-hub",
  codeEditor: "code-hub/editor",
  codeCommunity: "code-hub/community",
  tables: "tables",
  h2h: "h2h",
  teamForm: "team-form",
  goals: "goals-stats",
  ratings: "ratings",
} as const;

export type SportRoute = keyof typeof SPORT_ROUTES;

export function sportPath(route: SportRoute, sport: SportId = DEFAULT_SPORT): string {
  return `/${sport}/${SPORT_ROUTES[route]}`;
}

/**
 * The scores page's three views. Fixtures, live and results were three pages
 * until October 2026; they are one page now, at /live, with the view in the
 * query. The old /fixtures and /results URLs redirect here (next.config.ts).
 */
export type ScoresView = "live" | "fixtures" | "results";
export const SCORES_VIEWS: readonly ScoresView[] = ["live", "fixtures", "results"];

export function scoresPath(
  view: ScoresView,
  opts: { league?: string; day?: number; sport?: SportId } = {},
): string {
  const p = new URLSearchParams();
  if (view !== "live") p.set("view", view);
  if (opts.league) p.set("league", opts.league);
  if (opts.day) p.set("day", String(opts.day));
  const qs = p.toString();
  const base = sportPath("live", opts.sport);
  return qs ? `${base}?${qs}` : base;
}

export function matchPath(id: string, sport: SportId = DEFAULT_SPORT): string {
  return `/${sport}/match/${encodeURIComponent(id)}`;
}

/**
 * Where a session starts when the user did not ask for anywhere specific.
 *
 * Sign-up, sign-in and the end of onboarding all land here: today's picks,
 * the page people come for. (This was For You until that page was paused in
 * October 2026.)
 *
 * This is only the fallback. A `next` carried through the flow — from a gate
 * on a match page, say — still wins, and must: sending someone to their feed
 * instead of back to the thing they were reading is the same bug in a nicer
 * outfit.
 */
export const POST_AUTH_DESTINATION = sportPath("predictions");

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
