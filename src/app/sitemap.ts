import type { MetadataRoute } from "next";
import { LEAGUES } from "@/lib/leagues";

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://betrix.ai";

/**
 * Static routes plus a landing page per league.
 *
 * Individual match pages are deliberately excluded: they churn daily and a
 * sitemap full of URLs that 404 within the week is worse than none.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/predictions`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/live`, lastModified: now, changeFrequency: "always", priority: 0.8 },
    { url: `${SITE}/fixtures`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/trends`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/slip`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/responsible-gambling`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const leagues: MetadataRoute.Sitemap = LEAGUES.flatMap((l) => [
    {
      url: `${SITE}/fixtures?league=${l.code}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    },
    {
      url: `${SITE}/predictions?league=${l.code}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
  ]);

  return [...core, ...leagues];
}
