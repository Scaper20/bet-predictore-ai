"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useOverlay } from "@/components/ui/use-overlay";
import type { Tier } from "@/lib/entitlements";

export interface DrawerSection {
  title: string;
  links: { href: string; label: string }[];
}

/**
 * The secondary navigation surface, as a layer rather than a block.
 *
 * It used to render inside <header> in normal flow, so opening it grew the
 * header from 65px to 565px and pushed the page's <h1> down 500px — measured,
 * not estimated. A menu is a temporary layer, so it belongs out of flow: the
 * page keeps its layout and its scroll position while the panel covers it.
 *
 * Since the bottom bar took the five most-used destinations, what is left here
 * is genuinely secondary, and grouping it says so. An undifferentiated list of
 * every route would just be the site map again, one tap further away.
 */
export function MobileDrawer({
  open,
  onClose,
  sections,
  signedIn,
  tier,
}: {
  open: boolean;
  onClose: () => void;
  sections: DrawerSection[];
  /** null while the entitlement fetch is still in flight. */
  signedIn: boolean | null;
  tier: Tier;
}) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(
    open,
    onClose,
  );

  /*
   * Close when the viewport grows past the breakpoint that hides this.
   *
   * Without it, resizing to desktop with the menu open leaves `open` true —
   * the panel is display:none from `lg:hidden`, but the scroll lock is keyed
   * on state, not on visibility, so the page stays locked with no visible
   * control to unlock it.
   */
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      {/* Backdrop doubles as the dismiss target. aria-hidden because the
          close button below is the accessible way out. */}
      <button
        type="button"
        onClick={onClose}
        aria-hidden
        tabIndex={-1}
        className="animate-overlay-in absolute inset-0 h-full w-full cursor-default bg-black/65 backdrop-blur-sm"
      />

      <div
        ref={containerRef}
        className="animate-drawer-in absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-line-strong bg-shell shadow-2xl"
        // Keeps a rubber-band scroll inside the panel from chaining to the
        // page behind it on iOS, which the body overflow lock alone misses.
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-display text-lg font-bold tracking-tight">
            Betri<span className="text-brand">X</span>
          </span>
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="text-xl leading-none" aria-hidden>
              ✕
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <section key={section.title} className="mb-5">
              <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                {section.title}
              </h2>
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {link.label}
                </Link>
              ))}
            </section>
          ))}

          <div className="flex items-center justify-between border-t border-line px-3 pt-4">
            <span className="text-xs text-ink-muted">Theme</span>
            <ThemeToggle />
          </div>
        </div>

        {/* Pinned to the bottom of the panel: it is both the closest thing to
            the thumb and the reason most people open this menu. */}
        {signedIn !== null && (
          <div className="space-y-2 border-t border-line p-4">
            {signedIn ? (
              <>
                <ButtonLink href="/account" variant="secondary" className="w-full" onClick={onClose}>
                  Your account
                </ButtonLink>
                {tier === "free" && (
                  <ButtonLink href="/pricing" className="w-full" onClick={onClose}>
                    See plans
                  </ButtonLink>
                )}
              </>
            ) : (
              <>
                <ButtonLink href="/account/sign-up" className="w-full" onClick={onClose}>
                  Create free account
                </ButtonLink>
                <ButtonLink
                  href="/account/login"
                  variant="secondary"
                  className="w-full"
                  onClick={onClose}
                >
                  Sign in
                </ButtonLink>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
