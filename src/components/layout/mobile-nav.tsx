"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileDrawer, type DrawerSection } from "@/components/layout/mobile-drawer";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useAuthHint } from "@/components/entitlements/use-auth-hint";
import { sportPath, sportFromPathname } from "@/lib/routes";

/**
 * The whole mobile navigation system, in one place.
 *
 * The bar and the drawer are two halves of one thing — "More" is a bar tab
 * that opens the drawer — so the open state lives here rather than in the
 * header. That is also what let the header stop carrying a hamburger: with
 * the trigger in the thumb zone, a second one in the hardest-to-reach corner
 * of the screen was just two navigation systems competing.
 *
 * Renders in the (app) layout as a sibling of header/main/footer. Both halves
 * are `lg:hidden`, so nothing here reaches desktop.
 */
export function MobileNav() {
  const pathname = usePathname();
  const sport = sportFromPathname(pathname);
  const [open, setOpen] = useState(false);

  // Same source of truth as the desktop header — never cookies() in a layout.
  // See the comment in (app)/layout.tsx for why that matters to every ISR route.
  const { entitlement, loading } = useEntitlement();
  const hint = useAuthHint();
  const signedIn = loading ? hint : entitlement.signedIn;

  /*
   * Only what the bottom bar does not already carry.
   *
   * Repeating For You / Live / Picks / Slip here would put the same
   * destination in two places one tap apart, which is how a "menu" turns back
   * into an undifferentiated site map.
   */
  const sections: DrawerSection[] = [
    {
      title: "Browse",
      links: [
        { href: sportPath("fixtures", sport), label: "Fixtures" },
        { href: sportPath("trends", sport), label: "Trends" },
        { href: sportPath("trackRecord", sport), label: "Track Record" },
      ],
    },
    {
      title: "About",
      links: [
        { href: "/pricing", label: "Pricing" },
        { href: "/responsible-gambling", label: "Responsible Gambling" },
      ],
    },
  ];

  return (
    <>
      <BottomNav onOpenMenu={() => setOpen(true)} menuOpen={open} />
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        sections={sections}
        signedIn={signedIn}
        tier={entitlement.tier}
      />
    </>
  );
}
