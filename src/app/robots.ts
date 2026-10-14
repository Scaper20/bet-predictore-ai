import type { MetadataRoute } from "next";
import { SITE_URL as SITE } from "@/lib/site-url";

/*
 * Crawlers that collect training data or build SEO-tool indexes bring no
 * visitors, and in October 2026 they were most of the traffic: GPTBot alone
 * made ~78% of all requests, re-crawling every league filter on the
 * predictions, results, ratings and tables pages (each a full server render)
 * tens of thousands of times a day. Blocking them is the biggest single cut
 * to the Vercel bill.
 *
 * Search and answer engines stay allowed: Googlebot, Bingbot, OAI-SearchBot
 * and ChatGPT-User (ChatGPT search and browsing), PerplexityBot. Blocking
 * GPTBot keeps KiqStat out of OpenAI's training data, not out of ChatGPT
 * search results.
 */
const TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "Google-Extended",
  "meta-externalagent",
  "cohere-ai",
  "Diffbot",
];

const SEO_TOOL_CRAWLERS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "shapbot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...TRAINING_CRAWLERS, ...SEO_TOOL_CRAWLERS], disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Nothing useful for a crawler, and match ids rotate constantly.
          "/api/",
          // An internal operator tool, never for public discovery.
          "/admin",
          // Sign-in, billing and per-device pages: empty for a crawler.
          "/account/",
          "/football/combo",
          // Results by past day: an archive that only grows, and every
          // day/league pair is another server render.
          "/*?*day=",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
