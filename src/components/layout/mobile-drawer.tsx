"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { isActive, mobileMenus, navFor, type NavLink, type NavMenu } from "@/lib/nav";
import type { SportId } from "@/lib/sports";
import type { Tier } from "@/lib/entitlements";

/**
 * The full mobile menu, behind the bottom bar's "More" tab.
 *
 * Built from the same lib/nav.ts as the desktop menus, so the two never
 * drift. Four shortcuts up top (live, the two tools, pricing), then one
 * desktop menu at a time behind a row of tabs rather than four stacked
 * accordions: a phone shows one section with room to breathe, each row with
 * the line saying what it is. It opens on the section for the page you're
 * on. A full-screen layer, not a block in the page, so opening it never
 * moves what's underneath.
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
  const pathname = usePathname();
  const live = useLiveCount();
  const { tabs, tools } = navFor(sport);
  const menus = mobileMenus(tabs.flatMap((t) => (t.kind === "menu" ? [t.menu] : [])));
  const quick = tabs.flatMap((t) => (t.kind === "link" ? [t] : []));

  const [section, setSection] = useState(() => sectionFor(menus, pathname));
  // Re-pick the section on every open, so the menu starts where you are.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSection(sectionFor(menus, pathname));
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const choose = (id: string) => {
    setSection(id);
    // If the tabs have stuck to the top, bring the new section's start into
    // view instead of leaving the reader halfway down a list they didn't pick.
    const scroller = scrollRef.current;
    const bar = tabsRef.current;
    if (scroller && bar && scroller.scrollTop > bar.offsetTop) scroller.scrollTop = bar.offsetTop;
  };

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

  const liveLink = quick.find((q) => q.live);
  const pricing = quick.find((q) => !q.live);
  const [forge, ask] = tools;
  const current = menus.find((m) => m.id === section) ?? menus[0];

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="animate-sheet-in fixed inset-0 z-[60] flex flex-col bg-canvas lg:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", overscrollBehavior: "contain" }}
    >
      <div className="flex items-center gap-2 px-5 pb-2 pt-3">
        <span className="flex-1 font-display text-2xl font-bold tracking-tight">
          Betri<span className="text-brand">X</span>
        </span>
        <button
          ref={initialFocusRef}
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-11 place-items-center rounded-full bg-surface text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-8" style={{ overscrollBehavior: "contain" }}>
        <div className="space-y-3 px-5 pt-3">
          <SportSwitch size="lg" onNavigate={onClose} />
          <NavSearch sport={sport} variant="sheet" onNavigate={onClose} />
        </div>

        {/* Shortcuts: what most people open this menu for. */}
        <div className="grid grid-cols-2 gap-3 px-5 pt-6">
          {liveLink && (
            <Shortcut
              href={liveLink.href}
              tone="rose"
              icon="live"
              label={liveLink.label}
              desc={live !== null && live > 0 ? `${live} ${live === 1 ? "game" : "games"} in play` : "Scores as they happen"}
              onClose={onClose}
            />
          )}
          {forge && <Shortcut href={forge.href} tone="brand" icon="forge" label={forge.label} desc={forge.desc} onClose={onClose} />}
          {ask && (
            <Shortcut href={ask.href} action={ask.action} tone="violet" icon="ask" label={ask.label} desc={ask.desc} onClose={onClose} />
          )}
          {pricing && <Shortcut href={pricing.href} tone="amber" icon="pricing" label={pricing.label} desc="Plans in Naira" onClose={onClose} />}
        </div>

        {/* One section at a time. Sticks to the top while its list scrolls. */}
        <div ref={tabsRef} className="sticky top-0 z-10 mt-7 bg-canvas/95 px-5 py-3 backdrop-blur">
          <SectionTabs menus={menus} active={current.id} onChoose={choose} />
        </div>

        <div id={`menu-panel-${current.id}`} role="tabpanel" aria-labelledby={`menu-tab-${current.id}`} className="space-y-6 px-5 pt-2">
          <SectionBody menu={current} pathname={pathname} onClose={onClose} />
        </div>

        <Group title="App" className="px-5 pt-8">
          <InstallAppMenuItem onSelect={onClose} className={`${ROW} gap-3 text-ink`} />
          <NotificationsMenuItem onSelect={onClose} className={`${ROW} gap-3 text-ink`} />
          <div className={`${ROW} justify-between`}>
            <span>Theme</span>
            <ThemeToggle />
          </div>
        </Group>
      </div>

      {/* Pinned: the closest thing to the thumb, and why most people open this. */}
      <div
        className="space-y-2.5 border-t border-line bg-shell px-5 pt-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {signedIn === null ? null : signedIn ? (
          <div className="grid grid-cols-2 gap-3">
            <ButtonLink href="/account" variant="secondary" className="w-full" onClick={onClose}>
              Your account
            </ButtonLink>
            <ButtonLink href="/pricing" className="w-full" onClick={onClose}>
              {tier === "free" ? "See plans" : "Your plan"}
            </ButtonLink>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
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

/** The section holding the current page: its own match list first, then any
 * of its links (so /account opens on "More"). Predictions otherwise. */
function sectionFor(menus: NavMenu[], pathname: string): string {
  const hit =
    menus.find((m) => m.match.some((h) => isActive(pathname, h))) ??
    menus.find((m) => m.columns.some((c) => c.links.some((l) => !l.action && isActive(pathname, l.href))));
  return (hit ?? menus[0]).id;
}

/* ---------------------------------------------------------------- tabs */

function SectionTabs({ menus, active, onChoose }: { menus: NavMenu[]; active: string; onChoose: (id: string) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = menus.findIndex((m) => m.id === active);
    const next = menus[(i + (e.key === "ArrowRight" ? 1 : menus.length - 1)) % menus.length];
    onChoose(next.id);
    document.getElementById(`menu-tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Menu sections" onKeyDown={onKeyDown} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
      {menus.map((m) => {
        const on = m.id === active;
        return (
          <button
            key={m.id}
            id={`menu-tab-${m.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`menu-panel-${m.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChoose(m.id)}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              on ? "bg-ink text-shell" : "bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------- section body */

function SectionBody({ menu, pathname, onClose }: { menu: NavMenu; pathname: string; onClose: () => void }) {
  // League links read better as a row of chips than as a long list.
  const chips = menu.columns.find((c) => c.title === "Top leagues");
  const lists = menu.columns.filter((c) => c !== chips);
  return (
    <>
      {lists.map((col) => (
        // A single list needs no heading: the tab already names it.
        <Group key={col.title} title={lists.length > 1 ? col.title : undefined}>
          {col.links.map((l) => (
            <Row key={`${l.label}${l.href}`} link={l} current={!l.action && isActive(pathname, l.href)} onClose={onClose} />
          ))}
        </Group>
      ))}
      {chips && (
        <section>
          <h3 className="pb-3 font-sans text-[13px] font-semibold text-ink-dim">{chips.title}</h3>
          <div className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1">
            {chips.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onClose}
                className="flex h-11 shrink-0 snap-start items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink"
              >
                {l.label}
              </Link>
            ))}
            {chips.all && (
              <Link
                href={chips.all.href}
                onClick={onClose}
                className="flex h-11 shrink-0 snap-start items-center rounded-full border border-brand/35 px-4 text-sm font-semibold text-brand"
              >
                {chips.all.label}
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}

const ROW = "flex min-h-14 w-full items-center px-4 text-left text-[15px] font-medium text-ink";

/** A titled panel of rows, separated by inset rules. */
function Group({ title, className = "", children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <section className={className}>
      {title && <h3 className="pb-3 font-sans text-[13px] font-semibold text-ink-dim">{title}</h3>}
      <div className="overflow-hidden rounded-2xl bg-surface [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
    </section>
  );
}

function Row({ link, current, onClose }: { link: NavLink; current: boolean; onClose: () => void }) {
  const cls = `relative flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${
    current ? "bg-brand/[0.06]" : ""
  }`;
  const inner = (
    <>
      {current && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-brand" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] font-semibold ${current ? "text-brand" : link.soon ? "text-ink-muted" : "text-ink"}`}>{link.label}</span>
        {link.desc && <span className="text-[13px] leading-snug text-ink-dim">{link.desc}</span>}
      </span>
      {link.badge ? <NavBadge badge={link.badge} /> : <Chevron />}
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
    <Link href={link.href} onClick={onClose} aria-current={current ? "page" : undefined} className={cls}>
      {inner}
    </Link>
  );
}

/* ------------------------------------------------------------ shortcuts */

type Tone = "rose" | "brand" | "violet" | "amber";
type ShortcutIcon = "live" | "forge" | "ask" | "pricing";

const TONE: Record<Tone, { box: string; chip: string }> = {
  rose: { box: "border-rose/30 bg-rose/[0.06]", chip: "bg-rose/15 text-rose" },
  brand: { box: "border-brand/30 bg-brand/[0.06]", chip: "bg-brand text-brand-ink" },
  violet: { box: "border-violet/30 bg-violet/[0.07]", chip: "bg-violet/18 text-violet" },
  amber: { box: "border-amber/25 bg-amber/[0.05]", chip: "bg-amber/15 text-amber" },
};

function Shortcut({
  href,
  action,
  tone,
  icon,
  label,
  desc,
  onClose,
}: {
  href: string;
  action?: NavLink["action"];
  tone: Tone;
  icon: ShortcutIcon;
  label: string;
  desc?: string;
  onClose: () => void;
}) {
  const t = TONE[tone];
  const cls = `flex flex-col gap-3 rounded-2xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${t.box}`;
  const inner = (
    <>
      <span className={`grid size-9 place-items-center rounded-xl ${t.chip}`}>
        <ShortcutGlyph name={icon} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-bold text-ink">{label}</span>
        {desc && <span className="text-[13px] leading-snug text-ink-muted">{desc}</span>}
      </span>
    </>
  );
  if (action) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          onClose();
          runNavAction(action);
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={href} onClick={onClose} className={cls}>
      {inner}
    </Link>
  );
}

function ShortcutGlyph({ name }: { name: ShortcutIcon }) {
  if (name === "live") return <span className="live-dot size-2.5 rounded-full bg-rose" aria-hidden />;
  const p = { viewBox: "0 0 24 24", className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, "aria-hidden": true };
  if (name === "forge") return <svg {...p}><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>;
  if (name === "ask") return <svg {...p}><path d="M4 5h16v11H9l-5 4z" /></svg>;
  return <svg {...p}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>;
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
