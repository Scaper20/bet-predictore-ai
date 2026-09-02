"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AccountMenu } from "@/components/layout/account-menu";
import { SlipButton } from "@/components/layout/slip-button";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useAuthHint } from "@/components/entitlements/use-auth-hint";
import { sportPath, sportFromPathname } from "@/lib/routes";

/**
 * Four items, down from six.
 *
 * Trends and Selections came out. Trends is a browsing surface for people
 * already invested, so it keeps its footer link and a route in from
 * /predictions; Selections became the counter in the right-hand cluster,
 * which is a better shape for it. Track Record earned its place: deleting
 * /how-it-works made the settled record the site's entire trust argument, and
 * a trust argument nobody can find does not work.
 */
const NAV = [
  { route: "forYou", label: "For You" },
  { route: "live", label: "Live" },
  { route: "predictions", label: "Predictions" },
  { route: "fixtures", label: "Fixtures" },
  { route: "trackRecord", label: "Track Record" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Renders in the (app) layout, above the [sport] segment, so there are no
  // params to read — the active sport comes off the pathname.
  const sport = sportFromPathname(pathname);
  const nav = NAV.map((item) => ({ ...item, href: sportPath(item.route, sport) }));

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
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">
            Betri<span className="text-brand">X</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
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

        <div className="ml-auto hidden items-center gap-2 md:flex">
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

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <SlipButton sport={sport} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <span className="text-xl leading-none">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </Container>

      {open && (
        <nav className="border-t border-line bg-canvas px-4 pb-4 pt-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={sportPath("trends", sport)}
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            Trends
          </Link>

          <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3">
            <span className="text-xs text-ink-muted">Theme</span>
            <ThemeToggle />
          </div>

          {/* The CTA sits last on mobile: it is the closest thing to the
              thumb, and it is what the menu is for. */}
          {!resolving &&
            (signedIn ? (
              <div className="mt-2 space-y-2">
                <ButtonLink href="/account" variant="secondary" className="w-full">
                  Your account
                </ButtonLink>
                {entitlement.tier === "free" && (
                  <ButtonLink href="/pricing" className="w-full">
                    See plans
                  </ButtonLink>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <ButtonLink href="/account/sign-up" className="w-full">
                  Create free account
                </ButtonLink>
                <ButtonLink href="/account/login" variant="secondary" className="w-full">
                  Sign in
                </ButtonLink>
              </div>
            ))}
        </nav>
      )}
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
