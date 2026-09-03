"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { AccountMenu } from "@/components/layout/account-menu";
import { SlipButton } from "@/components/layout/slip-button";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useAuthHint } from "@/components/entitlements/use-auth-hint";
import { sportPath, sportFromPathname, type SportRoute } from "@/lib/routes";

/**
 * The primary nav.
 *
 * Trends and Selections stay out: Trends is a browsing surface for people
 * already invested, so it keeps its footer link and a route in from
 * /predictions; Selections is the counter in the right-hand cluster, which is
 * a better shape for it. Track Record earns its place because deleting
 * /how-it-works made the settled record the site's entire trust argument, and
 * a trust argument nobody can find does not work.
 *
 * Entries are either sport-scoped (resolved through sportPath) or absolute.
 * Pricing is the first that is neither a data surface nor under /[sport]/,
 * which is why this widened from a plain route list.
 *
 * Six items plus the logo and the auth cluster do not fit at md — they did not
 * quite fit at five either — so this nav starts at lg. Below that it is not a
 * narrower version of itself: navigation moves to the bottom bar and the
 * drawer behind it (see mobile-nav.tsx), and this header keeps only identity
 * and the sign-up CTA.
 */
type NavItem =
  | { route: SportRoute; label: string }
  | { href: string; label: string };

const NAV: readonly NavItem[] = [
  { route: "forYou", label: "For You" },
  { route: "live", label: "Live" },
  { route: "predictions", label: "Predictions" },
  { route: "fixtures", label: "Fixtures" },
  { route: "trackRecord", label: "Track Record" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();
  // Renders in the (app) layout, above the [sport] segment, so there are no
  // params to read — the active sport comes off the pathname.
  const sport = sportFromPathname(pathname);
  const nav = NAV.map((item) => ({
    label: item.label,
    href: "href" in item ? item.href : sportPath(item.route, sport),
  }));

  // Auth state comes from the entitlement context, never from cookies() in a
  // layout — see the comment in (app)/layout.tsx for why that distinction is
  // load-bearing for every ISR route on the site.
  const { entitlement, loading } = useEntitlement();

  // While that fetch is in flight, the bx_auth cookie says which of the two
  // clusters to paint. It is a hint, not a permission: `entitlement` still
  // decides everything the moment it lands, and the hint never gates content.
  const hint = useAuthHint();
  const signedIn = loading ? hint : entitlement.signedIn;
  const resolving = signedIn === null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <Container className="flex h-16 items-center gap-4">
        {/* -mx-1.5 px-1.5 py-2 rather than a bare inline row: the logo is the
            "go home" control on every page and measured 32px tall, which is a
            fiddly tap on a phone. The negative margin keeps it optically
            flush with the container edge. */}
        <Link
          href="/"
          className="-mx-1.5 flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">
            Betri<span className="text-brand">X</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <SlipButton sport={sport} />
          {resolving ? (
            <AuthPlaceholder />
          ) : signedIn ? (
            <>
              {entitlement.tier === "free" && (
                <ButtonLink href="/pricing" variant="secondary" className="px-4 py-2">
                  Upgrade
                </ButtonLink>
              )}
              <AccountMenu tier={entitlement.tier} email={entitlement.email} />
            </>
          ) : (
            <>
              <Link
                href="/account/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <ButtonLink href="/account/sign-up" variant="primary" className="px-4 py-2">
                Create free account
              </ButtonLink>
            </>
          )}
        </div>

        {/*
          No hamburger. Navigation on mobile lives in the bottom bar, whose
          "More" tab opens the drawer — a second trigger in the hardest-to-
          reach corner of the screen was two systems competing for one job.
          What is left is the one thing the bar cannot carry: the reason an
          anonymous visitor is here.
        */}
        <div className="ml-auto flex items-center lg:hidden">
          {!resolving && !signedIn && (
            <ButtonLink href="/account/sign-up" variant="primary" className="px-3.5 py-2 text-xs">
              Sign up
            </ButtonLink>
          )}
        </div>
      </Container>
    </header>
  );
}

/**
 * Holds the space when there is nothing to go on — no hint cookie yet and the
 * entitlement fetch still in flight, which in practice means a first-ever
 * visit before proxy.ts has set one.
 *
 * The alternative — assuming logged-out and rendering the sign-up CTA — puts
 * "Create free account" in front of someone who already has one. A neutral
 * shape is the cheaper mistake, and unlike <Gate> there is nothing here that
 * failing open would leak.
 */
function AuthPlaceholder() {
  return <div className="size-10 rounded-full bg-surface-2" aria-hidden />;
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/icon-green-96.png" alt="" width={32} height={32} className="size-8 rounded-lg" aria-hidden />
  );
}
