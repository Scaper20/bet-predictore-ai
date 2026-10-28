import type { Metadata, Viewport } from "next";
import { Unbounded, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL as SITE } from "@/lib/site-url";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY } from "@/lib/company";
import { SOCIALS, X_HANDLE } from "@/lib/socials";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { TrackedSlipsPushSync } from "@/components/pwa/tracked-slips-push-sync";
import { MaintenanceWatcher } from "@/components/layout/maintenance-watcher";
import { INSTALL_CAPTURE_SCRIPT } from "@/lib/pwa";
import "./globals.css";
import { AppSplash } from "@/components/pwa/app-splash";

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
      "@id": `${SITE}/#organization`,
      name: COMPANY.brand,
      legalName: COMPANY.legalName,
      url: SITE,
      logo: `${SITE}/brand/icon.png`,
      email: COMPANY.supportEmail,
      address: { "@type": "PostalAddress", addressCountry: COMPANY.countryCode },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: COMPANY.supportEmail },
      sameAs: SOCIALS.filter((s) => s.profile).map((s) => s.href),
    },
    {
      "@type": "WebSite",
      name: COMPANY.brand,
      url: SITE,
      publisher: { "@id": `${SITE}/#organization` },
    },
  ],
};

// Both are variable fonts, so one file each covers every weight in use.
// "swap" with Next's size-matched fallback (adjustFontFallback, on by default)
// rather than "optional": Next has metrics for both faces, so the fallback is
// sized to the same width and the swap doesn't reflow headings. That was the
// problem with the previous condensed display face, which had no metrics and
// fell back to a far wider Roboto on Android.
const heading = Unbounded({ variable: "--font-heading", subsets: ["latin"], display: "swap" });
const body = Space_Grotesk({ variable: "--font-body", subsets: ["latin"], display: "swap" });
// Odds, probabilities, scores and times — including the big numbers at the
// top of match and pick cards, so it is preloaded and swapped in like the
// other two rather than left to "optional".
const mono = IBM_Plex_Mono({
  variable: "--font-mono-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "KiqStat — Football Predictions & Live Trends",
    template: "%s · KiqStat",
  },
  description:
    "Data-driven football predictions for fans across Africa and the world. Real live scores, " +
    "real fixtures, and a statistical model fitted on actual results — not guesswork.",
  keywords: [
    "football predictions Nigeria", "football predictions Africa", "soccer predictions",
    "NPFL predictions", "Premier League predictions", "football prediction model", "live scores",
    "over 2.5 goals prediction", "both teams to score predictions", "football statistics",
    "1X2 predictions", "BTTS predictions", "GG NG predictions", "double chance predictions",
    "football odds", "soccer prediction tips", "accumulator tips", "correct score predictions",
  ],
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "KiqStat",
    title: "KiqStat — Football Predictions Built on Real Data",
    description:
      "Real fixtures, real live scores, and a statistical model fitted on actual results. " +
      "Know the numbers before you decide.",
  },
  twitter: {
    card: "summary_large_image",
    site: X_HANDLE,
    creator: X_HANDLE,
    title: "KiqStat — Football Predictions",
    description: "Data-driven football insight for fans across Africa and the world.",
  },
  robots: { index: true, follow: true },
  // Installed to the home screen (see app/manifest.ts). iOS ignores most of
  // the manifest and reads these instead: launch without Safari's chrome, and
  // let the dark canvas run up under the status bar. The header pads itself
  // by the safe-area inset so nothing sits under the notch.
  applicationName: "KiqStat",
  appleWebApp: { capable: true, title: "KiqStat", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#07090b" },
  ],
  width: "device-width",
  initialScale: 1,
  // Edge to edge, so the installed app fills the screen around the notch and
  // home indicator; safe-area insets keep content clear of both.
  viewportFit: "cover",
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

/**
 * X (Twitter) conversion tracking base code, pixel ri02j, exactly as X
 * supplies it: loads uwt.js once on every page so ad clicks from X can be
 * counted as visits. Its hosts are allowed in next.config.ts's CSP.
 */
const X_PIXEL_SCRIPT = `
!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','ri02j');
`;

/**
 * Google Analytics 4: on only when NEXT_PUBLIC_GA_MEASUREMENT_ID (G-XXXXXXX)
 * is set, and only on the production host, so previews and local runs don't
 * count as visits. Page views on client-side navigation are sent by GA's
 * enhanced measurement (history changes), on by default for a web stream.
 */
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "") && process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview"
  ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!
  : null;

const gaInit = (id: string) => `
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${id}');
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-NG"
      data-theme="dark"
      suppressHydrationWarning
      className={`${heading.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink flex flex-col">
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
        <script
          id="install-capture"
          dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }}
          suppressHydrationWarning
        />
        <JsonLd data={ORG_JSON_LD} />
        <AppSplash />
        {children}
        <ServiceWorkerRegister />
        <TrackedSlipsPushSync />
        <MaintenanceWatcher />
        <Analytics />
        <SpeedInsights />
        {GA_ID && (
          <>
            {/* Google Analytics 4 (gtag.js): hosts allowed in next.config.ts's CSP. */}
            <Script id="ga-loader" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <Script id="ga-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: gaInit(GA_ID) }} />
          </>
        )}
        {/* X conversion tracking base code */}
        <Script id="x-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: X_PIXEL_SCRIPT }} />
        {/* End X conversion tracking base code */}
      </body>
    </html>
  );
}
