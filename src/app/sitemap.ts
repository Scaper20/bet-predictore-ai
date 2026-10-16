import type { MetadataRoute } from "next";
import { LEAGUES } from "@/lib/leagues";
import { SITE_URL as SITE } from "@/lib/site-url";
import { matchPath, sportPath, scoresPath } from "@/lib/routes";
import { upcomingFeed } from "@/lib/service";

/**
 * Static routes, a landing page per league, and the next few days of match
 * pages.
 *
 * Match pages are where search traffic actually lands ("<home> vs <away>
 * prediction"), so they belong here — but only upcoming ones, regenerated
 * hourly, so the sitemap never advertises a fixture long gone. A feed outage
 * just drops them for that hour; the static part always renders.
 */
export const revalidate = 3600;

const MATCH_WINDOW_DAYS = 3;
/** The windows the league pages themselves show (predictions and fixtures pages). */
const PREDICTIONS_WINDOW_DAYS = 5;
const FIXTURES_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Sport-scoped URLs only. The flat paths these replaced still 308 (see
  // next.config.ts) but a sitemap should advertise the canonical URL, never
  // one that redirects. Pages whose content changes with the fixtures carry
  // today's date; evergreen pages carry none, because a lastmod that is
  // always "now" teaches Google to ignore the field for the whole sitemap.
  const core: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}${sportPath("predictions")}`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}${sportPath("live")}`, lastModified: now, changeFrequency: "always", priority: 0.8 },
    { url: `${SITE}${scoresPath("fixtures")}`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}${sportPath("trends")}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}${scoresPath("results")}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}${sportPath("tables")}`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}${sportPath("h2h")}`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}${sportPath("teamForm")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("goals")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("ratings")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/guides`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/help`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}${sportPath("trackRecord")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/responsible-use`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const [leagueFeed, matchFeed] = await Promise.all([
    upcomingFeed(FIXTURES_WINDOW_DAYS).catch(() => null),
    upcomingFeed(MATCH_WINDOW_DAYS).catch(() => null),
  ]);
  const upcoming = (leagueFeed?.matches ?? []).filter((m) => m.league.code);
  const codesIn = (days: number) => {
    const until = now.getTime() + days * DAY_MS;
    return new Set(upcoming.filter((m) => Date.parse(m.kickoff) <= until).map((m) => m.league.code));
  };
  const withFixtures = codesIn(FIXTURES_WINDOW_DAYS);
  const withPredictions = codesIn(PREDICTIONS_WINDOW_DAYS);

  /*
   * A league's fixtures and predictions pages are only listed while they have
   * games to show. Off-season and between-tournament pages (NPFL, AFCON, the
   * World Cup in October 2026) render the same empty-state boilerplate, and
   * Google crawled those and declined to index them; listing them also spends
   * crawl budget the live leagues need. They stay reachable and indexable,
   * just not advertised. If the feed fails, no league pages are listed for
   * that hour rather than all of them. Tables always have standings to show.
   */
  const leagues: MetadataRoute.Sitemap = LEAGUES.flatMap((l) => [
    ...(l.confederation
      ? []
      : [{
          url: `${SITE}${sportPath("tables", l.sport)}?league=${l.code}`,
          lastModified: now,
          changeFrequency: "hourly" as const,
          priority: 0.6,
        }]),
    ...(withFixtures.has(l.code)
      ? [{
          url: `${SITE}${scoresPath("fixtures", { league: l.code, sport: l.sport })}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.6,
        }]
      : []),
    ...(withPredictions.has(l.code)
      ? [{
          url: `${SITE}${sportPath("predictions", l.sport)}?league=${l.code}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.7,
        }]
      : []),
  ]);

  // Catalogued competitions only: the day-scan feeds also carry youth and
  // lower-division games nobody searches for, and a sitemap of thin pages
  // spends crawl budget the big fixtures need.
  const matches: MetadataRoute.Sitemap = (matchFeed?.matches ?? []).filter((m) => m.league.code).map((m) => ({
    url: `${SITE}${matchPath(m.id)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  // Next writes <loc> verbatim, and the scores page's URLs carry two query
  // parameters: a bare & would make the whole sitemap invalid XML.
  return [...core, ...leagues, ...matches].map((e) => ({ ...e, url: e.url.replace(/&/g, "&amp;") }));
}
