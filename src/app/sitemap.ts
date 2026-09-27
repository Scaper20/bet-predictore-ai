import type { MetadataRoute } from "next";
import { LEAGUES } from "@/lib/leagues";
import { SITE_URL as SITE } from "@/lib/site-url";
import { sportPath } from "@/lib/routes";

/**
 * Static routes plus a landing page per league.
 *
 * Individual match pages are deliberately excluded: they churn daily and a
 * sitemap full of URLs that 404 within the week is worse than none.
 */
export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...core, ...leagues];
}
