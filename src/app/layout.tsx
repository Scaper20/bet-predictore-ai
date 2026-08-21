import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"], display: "swap" });

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://betrix.ai").replace(/\/$/, "");

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
        {children}
      </body>
    </html>
  );
}
