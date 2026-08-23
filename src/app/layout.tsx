import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import { SITE_URL as SITE } from "@/lib/site-url";
import { JsonLd } from "@/components/seo/json-ld";
import "./globals.css";

/**
 * Organization + WebSite structured data, sitewide. Deliberately does NOT
 * include a WebSite.potentialAction SearchAction (the schema that can
 * unlock Google's "sitelinks search box") — this site has no real
 * free-text search endpoint, and fabricating one in structured data that
 * doesn't correspond to actual functionality would be exactly the kind of
 * dishonest claim this app's pricing/feature copy has deliberately avoided
 * elsewhere this session.
 */
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "BetriX",
      url: SITE,
      logo: `${SITE}/brand/icon-green.png`,
    },
    {
      "@type": "WebSite",
      name: "BetriX",
      url: SITE,
    },
  ],
};

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "BetriX — AI Football Predictions & Live Betting Trends",
    template: "%s · BetriX",
  },
  description:
    "Data-driven football predictions for Nigerian bettors. Real live scores, real fixtures, " +
    "and a statistical model fitted on actual results — not guesswork.",
  keywords: [
    "football predictions Nigeria", "soccer betting tips", "NPFL predictions",
    "Premier League predictions", "AI betting analysis", "live scores Nigeria",
    "over 2.5 goals prediction", "BTTS tips", "value bets",
  ],
  openGraph: {
    type: "website",
    locale: "en_NG",
    siteName: "BetriX",
    title: "BetriX — AI Football Predictions Built for Nigeria",
    description:
      "Real fixtures, real live scores, and a Dixon-Coles model fitted on actual results. " +
      "Know the numbers before you stake.",
  },
  twitter: {
    card: "summary_large_image",
    title: "BetriX — AI Football Predictions",
    description: "Data-driven football insight for Nigerian bettors.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#05080d" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Theme is intentionally NOT read via cookies() here. Reading a cookie in the
 * root layout would opt the entire app out of static rendering — every page's
 * `export const revalidate`, including the fixtures/predictions/trends pages
 * that exist specifically to avoid re-hammering rate-limited football-data
 * feeds, would degrade to full per-request SSR. Instead `data-theme` defaults
 * to "dark" in the static markup (today's only theme, so no regression for
 * anyone), and this inline script — a raw <script> rather than next/script,
 * since next/script's beforeInteractive strategy is meant for third-party
 * scripts and produces an invalid-DOM-nesting warning in dev when used for a
 * synchronous first-child-of-body inline script like this — runs during
 * initial HTML parsing, before paint, and corrects the attribute from the
 * `theme` cookie with no visible flash. See theme-toggle.tsx for where that
 * cookie gets set.
 */
const THEME_INIT_SCRIPT = `
  try {
    var m = document.cookie.match(/(?:^|; )theme=(dark|light)/);
    if (m && m[1] === "light") document.documentElement.setAttribute("data-theme", "light");
  } catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      data-theme="dark"
      suppressHydrationWarning
      className={`${sora.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <JsonLd data={ORG_JSON_LD} />
        {children}
      </body>
    </html>
  );
}
