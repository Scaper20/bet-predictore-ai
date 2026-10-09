"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { AccountMenu } from "@/components/layout/account-menu";
import { SlipButton } from "@/components/layout/slip-button";
import { AskButton } from "@/components/ask/ask-button";
import { SportSwitch } from "@/components/layout/sport-switch";
import { NavSearch } from "@/components/layout/nav-search";
import { MegaNav } from "@/components/layout/mega-nav";
import { openNotifications } from "@/components/layout/nav-actions";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useAuthHint } from "@/components/entitlements/use-auth-hint";
import { sportFromPathname } from "@/lib/routes";
import { navFor } from "@/lib/nav";

/**
 * The site header.
 *
 * Desktop is two rows: identity, sport, search and the personal cluster on
 * top; the section nav with its menus below (mega-nav.tsx). Every section
 * BetriX has or has announced is in those menus — the announced ones are
 * tagged "Soon" and lead to their coming-soon page — so the nav shows where
 * the product is going and new features slot in without a redesign. The
 * menus themselves are data, in lib/nav.ts.
 *
 * Phones get one row: identity, Ask BetriX, the slip and the sign-up CTA.
 * Navigation there lives in the bottom bar and the menu behind its "More"
 * tab (mobile-nav.tsx), both reading the same lib/nav.ts.
 *
 * The header's height is --header-h in globals.css; sticky things below it
 * read that rather than repeating a number.
 */
export function SiteHeader() {
  const pathname = usePathname();
  // Renders in the (app) layout, above the [sport] segment, so there are no
  // params to read — the active sport comes off the pathname.
  const sport = sportFromPathname(pathname);
  const { tabs } = navFor(sport);

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
    <header data-site-header
      className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-xl"
      // Installed on iOS the status bar is translucent and the page runs up
      // under it (layout.tsx); this keeps the header clear of the notch. Zero
      // everywhere else.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Container className="flex h-16 items-center gap-3 lg:gap-4">
        {/* -mx-1.5 px-1.5 py-2: the logo is the "go home" control on every
            page, and 32px tall alone is a fiddly tap on a phone. */}
        <Link
          href="/"
          aria-label="BetriX home"
          className="-mx-1.5 flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight max-[379px]:hidden">
            Betri<span className="text-brand">X</span>
          </span>
        </Link>

        <div className="hidden lg:block">
          <SportSwitch />
        </div>
        <div className="hidden min-w-0 flex-1 lg:block">
          <NavSearch sport={sport} />
        </div>

        {/* Desktop: the personal cluster. */}
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <AskButton />
          <SlipButton sport={sport} />
          <button
            type="button"
            onClick={openNotifications}
            aria-label="Notifications"
            title="Notifications"
            className="grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <BellIcon />
          </button>
          {resolving ? (
            <AuthPlaceholder />
          ) : signedIn ? (
            <>
              {entitlement.tier === "free" && (
                <ButtonLink href="/pricing" variant="secondary" className="px-4 py-2">
                  Upgrade
                </ButtonLink>
              )}
              <AccountMenu tier={entitlement.tier} email={entitlement.email} displayName={entitlement.displayName} />
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

        {/* Phones: Ask BetriX with the slip beside it, then the reason an
            anonymous visitor is here. Everything else is in the bottom bar. */}
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <AskButton size="sm" />
          <SlipButton sport={sport} />
          {!resolving && !signedIn && (
            <ButtonLink href="/account/sign-up" variant="primary" className="ml-1 px-3 py-2 text-xs">
              Sign up
            </ButtonLink>
          )}
        </div>
      </Container>

      <MegaNav tabs={tabs} />
    </header>
  );
}

/**
 * Holds the space when there is nothing to go on — no hint cookie yet and the
 * entitlement fetch still in flight, which in practice means a first-ever
 * visit before proxy.ts has set one. Assuming logged-out would put "Create
 * free account" in front of someone who already has one.
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

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" strokeLinejoin="round" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}
