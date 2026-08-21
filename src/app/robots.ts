import type { MetadataRoute } from "next";
import { SITE_URL as SITE } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing useful for a crawler, and match ids rotate constantly.
      disallow: ["/api/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
