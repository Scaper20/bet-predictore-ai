import type { MetadataRoute } from "next";
import { sportPath } from "@/lib/routes";

/**
 * Web app manifest — what makes KiqStat installable to a phone's home screen.
 *
 * Opens on today's predictions rather than the marketing home page: someone
 * who installed the app already knows what it is and came back for the picks.
 * Colours match the dark canvas so the splash screen and status bar blend
 * into the first paint instead of flashing white.
 *
 * Two icon sets on purpose. "any" icons are cropped so the mark fills the
 * square (iOS and desktop use these as-is); "maskable" icons keep the full
 * green field so Android's circle/squircle masks never clip the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KiqStat — Football Predictions",
    short_name: "KiqStat",
    description:
      "Football predictions for fans across Africa and the world, fitted on real results: probabilities, live scores and the sample size behind every pick.",
    start_url: sportPath("predictions"),
    scope: "/",
    display: "standalone",
    background_color: "#05080d",
    theme_color: "#05080d",
    lang: "en-NG",
    dir: "ltr",
    categories: ["sports", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android) for these.
    shortcuts: [
      {
        name: "Today's predictions",
        short_name: "Predictions",
        url: sportPath("predictions"),
        icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Live scores",
        short_name: "Live",
        url: sportPath("live"),
        icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Fixtures",
        short_name: "Fixtures",
        url: sportPath("fixtures"),
        icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "My slip",
        short_name: "Slip",
        url: `${sportPath("trackedSlips")}#slip`,
        icons: [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
