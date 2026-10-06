"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useOverlay } from "@/components/ui/use-overlay";
import { InstallAppMenuItem } from "@/components/pwa/install-app-menu-item";
import { NotificationsMenuItem } from "@/components/pwa/notifications-menu-item";
import { SportSwitch } from "@/components/layout/sport-switch";
import { NavSearch } from "@/components/layout/nav-search";
import { NavBadge } from "@/components/layout/mega-nav";
import { runNavAction } from "@/components/layout/nav-actions";
import { useLiveCount } from "@/components/layout/use-live-count";
import { navFor, type NavLink, type NavMenu } from "@/lib/nav";
import type { SportId } from "@/lib/sports";
import type { Tier } from "@/lib/entitlements";

/**
 * The full mobile menu, behind the bottom bar's "More" tab.
 *
 * Built from the same lib/nav.ts as the desktop menus, so the two never
 * drift: tools as tiles up top, then one collapsible section per desktop
 * menu, then app settings and the account buttons. Announced features are
 * listed with a "Soon" tag. A full-screen layer, not a block in the page, so
 * opening it never moves what's underneath.
 */
export function MobileDrawer({
  open,
  onClose,
  sport,
  signedIn,
  tier,
}: {
  open: boolean;
  onClose: () => void;
  sport: SportId;
  /** null while the entitlement fetch is still in flight. */
  signedIn: boolean | null;
  tier: Tier;
}) {
  const { containerRef, initialFocusRef } = useOverlay<HTMLDivElement, HTMLButtonElement>(open, onClose);
  const live = useLiveCount();
  const [section, setSection] = useState<string | null>("predictions");
  const { tabs, tools } = navFor(sport);
  const menus = tabs.flatMap((t) => (t.kind === "menu" ? [t.menu] : []));
  const quick = tabs.flatMap((t) => (t.kind === "link" ? [t] : []));

  // Close when the viewport grows past the breakpoint that hides this, or the
  // scroll lock (keyed on state, not visibility) would strand a desktop page.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && onClose();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="animate-sheet-in fixed inset-0 z-[60] flex flex-col bg-shell lg:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", overscrollBehavior: "contain" }}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex-1 font-display text-xl font-bold tracking-tight">
          Betri<span className="text-brand">X</span>
        </span>
        <button
          ref={initialFocusRef}
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink-muted transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        <div className="space-y-3 px-4 pb-2 pt-4">
          <SportSwitch size="lg" onNavigate={onClose} />
          <NavSearch sport={sport} variant="sheet" onNavigate={onClose} />
        </div>

        {/* Tools */}
        <section aria-label="Tools" className="px-4 pb-1 pt-3">
          <p className="pb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-dim">Tools</p>
          <div className="grid grid-cols-2 gap-2.5">
            {tools.map((t, i) => (
              <ToolTile key={t.label} link={t} tone={i === 0 ? "brand" : i === 1 ? "violet" : "muted"} onClose={onClose} />
            ))}
          </div>
        </section>

        {/* Quick links */}
        <div className="mt-3 border-y border-line px-4">
          {quick.map((q) => (
            <Link key={q.id} href={q.href} onClick={onClose} className="flex min-h-12 items-center justify-between text-[15px] font-semibold text-ink">
              <span className="flex items-center gap-2.5">
                {q.live && <span className="live-dot size-2 rounded-full bg-rose" aria-hidden />}
                {q.label}
              </span>
              {q.live && live !== null && live > 0 ? (
                <span className="tnum rounded-full bg-rose/14 px-2 font-mono text-[11px] text-rose">{live} live</span>
              ) : (
                <Chevron />
              )}
            </Link>
          ))}
        </div>

        {/* Sections */}
        <div className="px-4">
          {menus.map((m) => (
            <Section
              key={m.id}
              menu={m}
              open={section === m.id}
              onToggle={() => setSection(section === m.id ? null : m.id)}
              onClose={onClose}
            />
          ))}
        </div>

        {/* Settings */}
        <div className="px-1 py-3">
          <InstallAppMenuItem onSelect={onClose} />
          <NotificationsMenuItem onSelect={onClose} />
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-sm font-medium text-ink-muted">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Pinned: the closest thing to the thumb, and why most people open this. */}
      <div
        className="space-y-2.5 border-t border-line bg-canvas p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {signedIn === null ? null : signedIn ? (
          <div className="grid grid-cols-2 gap-2.5">
            <ButtonLink href="/account" variant="secondary" className="w-full" onClick={onClose}>
              Your account
            </ButtonLink>
            <ButtonLink href="/pricing" className="w-full" onClick={onClose}>
              {tier === "free" ? "See plans" : "Your plan"}
            </ButtonLink>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <ButtonLink href="/account/login" variant="secondary" className="w-full" onClick={onClose}>
              Sign in
            </ButtonLink>
            <ButtonLink href="/account/sign-up" className="w-full" onClick={onClose}>
              Create account
            </ButtonLink>
          </div>
        )}
        <p className="text-center text-[11px] text-ink-dim">18+ only. Bet responsibly.</p>
      </div>
    </div>
  );
}

function Section({ menu, open, onToggle, onClose }: { menu: NavMenu; open: boolean; onToggle: () => void; onClose: () => void }) {
  // League links read better as chips than as a long list.
  const chips = menu.columns.find((c) => c.title === "Top leagues");
  const lists = menu.columns.filter((c) => c !== chips);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between text-left text-base font-bold text-ink"
      >
        {menu.label}
        <svg viewBox="0 0 24 24" className={`size-[18px] text-ink-dim transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="pb-4">
          {lists.map((col) => (
            <div key={col.title} className="pb-1">
              {lists.length > 1 && (
                <p className="pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-dim">{col.title}</p>
              )}
              {col.links.map((l) => (
                <Row key={`${l.label}${l.href}`} link={l} onClose={onClose} />
              ))}
            </div>
          ))}
          {chips && (
            <>
              <p className="pb-2.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-dim">{chips.title}</p>
              <div className="flex flex-wrap gap-2">
                {chips.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={onClose}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"
                  >
                    {l.label}
                  </Link>
                ))}
                {chips.all && (
                  <Link href={chips.all.href} onClick={onClose} className="rounded-full border border-brand/30 px-3 py-1.5 text-[13px] font-semibold text-brand">
                    {chips.all.label}
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ link, onClose }: { link: NavLink; onClose: () => void }) {
  const cls = "flex min-h-11 w-full items-center justify-between gap-3 text-left text-[15px]";
  const inner = (
    <>
      <span className={link.soon ? "text-ink-muted" : "font-medium text-ink"}>{link.label}</span>
      {link.badge && <NavBadge badge={link.badge} />}
    </>
  );
  if (link.action) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          onClose();
          runNavAction(link.action!);
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={link.href} onClick={onClose} className={cls}>
      {inner}
    </Link>
  );
}

const TILE: Record<"brand" | "violet" | "muted", { box: string; icon: string }> = {
  brand: { box: "border-brand/35", icon: "bg-brand text-brand-ink" },
  violet: { box: "border-violet/35", icon: "bg-violet/18 text-violet" },
  muted: { box: "border-line", icon: "bg-surface-2 text-ink-muted" },
};

function ToolTile({ link, tone, onClose }: { link: NavLink; tone: keyof typeof TILE; onClose: () => void }) {
  const t = TILE[tone];
  const inner = (
    <>
      <span className="flex items-start justify-between">
        <span className={`grid size-8 place-items-center rounded-[9px] ${t.icon}`}>
          <ToolIcon label={link.label} />
        </span>
        {link.soon && <NavBadge badge={{ text: "Soon", tone: "muted" }} />}
      </span>
      <span className={`text-sm font-bold ${link.soon ? "text-ink-muted" : "text-ink"}`}>{link.label}</span>
      {link.desc && <span className="text-[11px] leading-snug text-ink-dim">{link.desc}</span>}
    </>
  );
  const cls = `flex flex-col gap-1.5 rounded-2xl border bg-surface p-3 text-left ${t.box}`;
  return link.action ? (
    <button
      type="button"
      className={cls}
      onClick={() => {
        onClose();
        runNavAction(link.action!);
      }}
    >
      {inner}
    </button>
  ) : (
    <Link href={link.href} onClick={onClose} className={cls}>
      {inner}
    </Link>
  );
}

function ToolIcon({ label }: { label: string }) {
  const p = { viewBox: "0 0 24 24", className: "size-[18px]", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, "aria-hidden": true };
  if (label === "Forge") return <svg {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>;
  if (label === "Ask BetriX") return <svg {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11" /></svg>;
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
