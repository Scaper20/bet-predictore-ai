import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"], display: "swap" });

const SITE = "https://naijaodds.ai";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "NaijaOdds — AI Football Predictions & Live Betting Trends",
    template: "%s · NaijaOdds",
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
    siteName: "NaijaOdds",
    title: "NaijaOdds — AI Football Predictions Built for Nigeria",
    description:
      "Real fixtures, real live scores, and a Dixon-Coles model fitted on actual results. " +
      "Know the numbers before you stake.",
  },
  twitter: {
    card: "summary_large_image",
    title: "NaijaOdds — AI Football Predictions",
    description: "Data-driven football insight for Nigerian bettors.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#060a10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      className={`${sora.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink flex flex-col">{children}</body>
    </html>
  );
}
