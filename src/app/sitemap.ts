import type { MetadataRoute } from "next";
import { LEAGUES } from "@/lib/leagues";
import { SITE_URL as SITE } from "@/lib/site-url";
import { matchPath, sportPath } from "@/lib/routes";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Sport-scoped URLs only. The flat paths these replaced still 308 (see
  // next.config.ts) but a sitemap should advertise the canonical URL, never
  // one that redirects.
  const core: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}${sportPath("predictions")}`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}${sportPath("live")}`, lastModified: now, changeFrequency: "always", priority: 0.8 },
    { url: `${SITE}${sportPath("fixtures")}`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}${sportPath("trends")}`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}${sportPath("trackRecord")}`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}${sportPath("slip")}`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/responsible-gambling`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const leagues: MetadataRoute.Sitemap = LEAGUES.flatMap((l) => [
    {
      url: `${SITE}${sportPath("fixtures", l.sport)}?league=${l.code}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    },
    {
      url: `${SITE}${sportPath("predictions", l.sport)}?league=${l.code}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
  ]);

  const feed = await upcomingFeed(MATCH_WINDOW_DAYS).catch(() => null);
  // Catalogued competitions only: the day-scan feeds also carry youth and
  // lower-division games nobody searches for, and a sitemap of thin pages
  // spends crawl budget the big fixtures need.
  const matches: MetadataRoute.Sitemap = (feed?.matches ?? []).filter((m) => m.league.code).map((m) => ({
    url: `${SITE}${matchPath(m.id)}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  return [...core, ...leagues, ...matches];
}
