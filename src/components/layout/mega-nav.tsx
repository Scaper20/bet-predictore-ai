"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isActive, type Badge, type NavFeature, type NavLink, type NavMenu, type NavTab } from "@/lib/nav";
import { Container } from "@/components/ui/container";
import { runNavAction } from "@/components/layout/nav-actions";
import { useLiveCount } from "@/components/layout/use-live-count";

/**
 * The desktop nav's second row, with a menu under each section.
 *
 * Menus open on hover after a short pause (so sweeping the pointer across
 * the row doesn't flash every panel), on click, and from the keyboard; they
 * close on Escape, on leaving the header, on choosing a link, and on a route
 * change. The page behind dims while one is open.
 */
export function MegaNav({ tabs }: { tabs: NavTab[] }) {
  const pathname = usePathname();
  const live = useLiveCount();
  const [open, setOpen] = useState<string | null>(null);
  const enterTimer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  const clear = () => {
    window.clearTimeout(enterTimer.current);
    window.clearTimeout(leaveTimer.current);
  };
  const close = useCallback(() => {
    clear();
    setOpen(null);
  }, []);

  // Close when the route changes.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        root.current?.querySelector<HTMLButtonElement>(`[data-menu="${open}"]`)?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => clear, []);

  const menu = tabs.find((t): t is Extract<NavTab, { kind: "menu" }> => t.kind === "menu" && t.menu.id === open)?.menu;

  return (
    <div
      ref={root}
      className="relative hidden lg:block"
      onMouseLeave={() => {
        clear();
        leaveTimer.current = window.setTimeout(() => setOpen(null), 160);
      }}
      onMouseEnter={() => window.clearTimeout(leaveTimer.current)}
    >
      <nav aria-label="Main" className="border-t border-line/70 bg-shell/60">
        <Container className="flex h-12 items-stretch gap-0.5">
          {tabs.map((tab) => {
            if (tab.kind === "link") {
              const here = isActive(pathname, tab.href);
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  onMouseEnter={() => {
                    clear();
                    enterTimer.current = window.setTimeout(() => setOpen(null), 90);
                  }}
                  className={tabClass(here, false)}
                  aria-current={here ? "page" : undefined}
                >
                  {tab.live && <span className="live-dot size-2 rounded-full bg-rose" aria-hidden />}
                  {tab.label}
                  {tab.live && live !== null && live > 0 && (
                    <span className="tnum rounded-full bg-rose/14 px-1.5 font-mono text-[11px] text-rose">{live}</span>
                  )}
                </Link>
              );
            }
            const m = tab.menu;
            const isOpen = open === m.id;
            const here = m.match.some((h) => isActive(pathname, h));
            return (
              <button
                key={m.id}
                type="button"
                data-menu={m.id}
                aria-expanded={isOpen}
                aria-haspopup="true"
                onMouseEnter={() => {
                  clear();
                  enterTimer.current = window.setTimeout(() => setOpen(m.id), open ? 0 : 110);
                }}
                onClick={() => {
                  clear();
                  setOpen(isOpen ? null : m.id);
                }}
                className={tabClass(here, isOpen)}
              >
                {m.label}
                <svg
                  viewBox="0 0 20 20"
                  className={`size-3.5 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden
                >
                  <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
          <div className="flex-1" />
          <Link
            href="/responsible-gambling"
            className="flex items-center gap-2 self-center text-xs text-ink-dim transition-colors hover:text-ink-muted"
          >
            <span className="rounded-md border border-line-strong px-1.5 py-px font-mono text-[10.5px]">18+</span>
            Bet responsibly
          </Link>
        </Container>
      </nav>

      {menu && <MenuPanel menu={menu} onChoose={close} />}
      {/* Portalled: the header's backdrop blur makes it the containing
          block for anything fixed inside it, so a fixed scrim in here would
          only cover the header. */}
      {menu &&
        createPortal(
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
            onMouseEnter={() => {
              clear();
              leaveTimer.current = window.setTimeout(() => setOpen(null), 160);
            }}
            className="animate-overlay-in fixed inset-0 z-40 hidden cursor-default bg-black/55 lg:block"
          />,
          document.body,
        )}
    </div>
  );
}

function tabClass(here: boolean, open: boolean) {
  return [
    "relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
    here ? "border-brand text-ink" : "border-transparent",
    open ? "bg-surface text-ink" : here ? "" : "text-ink-muted hover:text-ink",
  ].join(" ");
}

function MenuPanel({ menu, onChoose }: { menu: NavMenu; onChoose: () => void }) {
  const cols = menu.columns.length;
  return (
    <div
      role="region"
      aria-label={`${menu.label} menu`}
      className="animate-menu-in absolute inset-x-0 top-full z-10 border-b border-line bg-shell shadow-[0_24px_48px_rgb(0_0_0/0.55)]"
    >
      <Container
        className="grid gap-7 py-7"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr)) minmax(0, 1.2fr)` }}
      >
        {menu.columns.map((col) => (
          <div key={col.title} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-dim">{col.title}</p>
            {col.links.map((l) => (
              <MenuLink key={`${l.label}${l.href}`} link={l} onChoose={onChoose} />
            ))}
            {col.all && (
              <Link href={col.all.href} onClick={onChoose} className="px-2.5 py-2 text-[13px] font-bold text-brand hover:underline">
                {col.all.label} →
              </Link>
            )}
          </div>
        ))}
        <FeatureCard feature={menu.feature} onChoose={onChoose} />
      </Container>
    </div>
  );
}

const BADGE: Record<Badge["tone"], string> = {
  brand: "bg-brand/12 text-brand",
  amber: "bg-amber/14 text-amber",
  violet: "bg-violet/15 text-violet",
  rose: "bg-rose/14 text-rose",
  muted: "bg-surface-3 text-ink-dim",
};

export function NavBadge({ badge }: { badge: Badge }) {
  return (
    <span className={`rounded px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider ${BADGE[badge.tone]}`}>
      {badge.text}
    </span>
  );
}

function MenuLink({ link, onChoose }: { link: NavLink; onChoose: () => void }) {
  const inner = (
    <>
      <span className={`flex items-center gap-2 text-sm font-semibold ${link.soon ? "text-ink-muted" : "text-ink"}`}>
        {link.label}
        {link.badge && <NavBadge badge={link.badge} />}
      </span>
      {link.desc && <span className="text-xs leading-snug text-ink-dim">{link.desc}</span>}
    </>
  );
  const cls =
    "flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand";
  if (link.action) {
    return (
      <button
        type="button"
        className={cls}
        onClick={() => {
          onChoose();
          runNavAction(link.action!);
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <Link href={link.href} onClick={onChoose} className={cls}>
      {inner}
    </Link>
  );
}

const TONES: Record<NavFeature["tone"], { card: string; kicker: string; cta: string }> = {
  brand: { card: "border-brand/30 bg-surface", kicker: "text-brand", cta: "bg-brand text-brand-ink hover:bg-brand-strong" },
  violet: { card: "border-violet/40 bg-violet/[0.06]", kicker: "text-violet", cta: "bg-violet text-canvas hover:opacity-90" },
  gold: { card: "border-amber/40 bg-amber/[0.05]", kicker: "text-amber", cta: "bg-amber text-canvas hover:opacity-90" },
};

function FeatureCard({ feature, onChoose }: { feature: NavFeature; onChoose: () => void }) {
  const t = TONES[feature.tone];
  const ctaCls = `mt-1 inline-flex min-h-10 items-center self-start rounded-xl px-4 text-sm font-extrabold transition-colors ${t.cta}`;
  return (
    <aside className={`flex flex-col gap-3 self-start rounded-2xl border p-5 ${t.card}`}>
      <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${t.kicker}`}>{feature.kicker}</p>
      <p className="font-display text-[28px] font-bold leading-[1.05] text-ink">{feature.title}</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">{feature.body}</p>
      {feature.cta.action ? (
        <button
          type="button"
          className={ctaCls}
          onClick={() => {
            onChoose();
            runNavAction(feature.cta.action!);
          }}
        >
          {feature.cta.label}
        </button>
      ) : (
        <Link href={feature.cta.href} onClick={onChoose} className={ctaCls}>
          {feature.cta.label}
        </Link>
      )}
    </aside>
  );
}
