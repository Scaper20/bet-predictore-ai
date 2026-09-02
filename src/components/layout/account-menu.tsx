"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Tier } from "@/lib/entitlements";
import { Badge } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { signOut } from "@/app/actions/auth";

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pass: "Weekend Pass",
  pro: "Pro",
  vip: "VIP",
};

/**
 * The signed-in entry point: who you are, what you're on, and where to go.
 *
 * Built on <details>/<summary> rather than a button and a state hook, the same
 * way the landing FAQ is. That is not laziness — it means the toggle, the
 * Escape key, and the whole thing working before hydration all come from the
 * browser rather than from code that has to be right. What it does not give
 * you is close-on-outside-click or focus return, so those are the only two
 * behaviours added by hand below.
 *
 * There is no Dialog primitive in this codebase and a menu of five links does
 * not justify introducing one.
 */
export function AccountMenu({ tier, email }: { tier: Tier; email: string | null }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // <details> closes itself on Escape, but focus is left floating on the
      // page — put it back on the trigger so keyboard users keep their place.
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const initial = (email?.trim()[0] ?? "?").toUpperCase();
  const paid = tier !== "free";

  return (
    <details ref={ref} className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-line bg-surface-2 text-sm font-bold text-ink transition-colors hover:border-line-strong"
        aria-label="Account menu"
      >
        <span aria-hidden>{initial}</span>
      </summary>

      <div className="card absolute right-0 z-50 mt-2 w-64 p-2 shadow-2xl">
        <div className="border-b border-line px-3 pb-3 pt-2">
          <p className="truncate text-sm font-semibold">{email ?? "Signed in"}</p>
          <Badge tone={paid ? "brand" : "neutral"} className="mt-2">
            {TIER_LABEL[tier]}
          </Badge>
        </div>

        <nav className="py-1">
          <MenuLink href="/account">Account</MenuLink>
          <MenuLink href="/account#preferences">Preferences</MenuLink>
          <MenuLink href="/account/billing">{paid ? "Plan & billing" : "Upgrade"}</MenuLink>
        </nav>

        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          <span className="text-xs text-ink-muted">Theme</span>
          <ThemeToggle />
        </div>

        <form action={signOut} className="border-t border-line pt-1">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
