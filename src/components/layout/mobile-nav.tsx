"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { useEntitlement } from "@/components/entitlements/entitlement-provider";
import { useAuthHint } from "@/components/entitlements/use-auth-hint";
import { sportFromPathname } from "@/lib/routes";

/**
 * The whole mobile navigation system, in one place.
 *
 * The bar and the menu are two halves of one thing — "More" is a bar tab
 * that opens the menu — so the open state lives here. Both read lib/nav.ts,
 * the same source as the desktop header. Renders in the (app) layout; both
 * halves are `lg:hidden`, so nothing here reaches desktop.
 */
export function MobileNav() {
  const pathname = usePathname();
  const sport = sportFromPathname(pathname);
  const [open, setOpen] = useState(false);

  // Same source of truth as the desktop header — never cookies() in a layout.
  const { entitlement, loading } = useEntitlement();
  const hint = useAuthHint();
  const signedIn = loading ? hint : entitlement.signedIn;

  return (
    <>
      <BottomNav onOpenMenu={() => setOpen((o) => !o)} menuOpen={open} />
      <MobileDrawer open={open} onClose={() => setOpen(false)} sport={sport} signedIn={signedIn} tier={entitlement.tier} />
    </>
  );
}
