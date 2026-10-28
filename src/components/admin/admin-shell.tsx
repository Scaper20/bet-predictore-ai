"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AdminIdentity } from "@/lib/admin";
import { ROLES, navFor, navMatch, type NavSection } from "@/lib/admin-access";
import { signOut } from "@/app/actions/auth";
import { LogoLockup } from "@/components/brand/logo";
import { AdminIcon } from "@/components/admin/admin-icons";
import { CommandPalette } from "@/components/admin/command-palette";

export type AdminEnv = "production" | "preview" | "development";

const ENV_STYLE: Record<AdminEnv, { label: string; className: string }> = {
  production: { label: "PROD", className: "border-brand/30 text-brand" },
  preview: { label: "PREVIEW", className: "border-amber/30 text-amber" },
  development: { label: "LOCAL", className: "border-cyan/30 text-cyan" },
};

/**
 * The admin frame: a grouped sidebar that only lists what this person's roles
 * can open, and a command bar with where you are, which environment this is,
 * the Lagos clock and a ⌘K jump-to.
 *
 * Hiding a link is a courtesy, not the control: every page and action checks
 * its own permission on the server (lib/admin.ts, admin-guards.test.ts).
 */
export function AdminShell({
  identity,
  hiddenNav = [],
  counts = {},
  maintenanceOn = false,
  env = "production",
  children,
}: {
  identity: AdminIdentity;
  /** Pages the roles allow but something else rules out (Mail: one named account). */
  hiddenNav?: string[];
  /** Small counters beside nav items, e.g. open tickets. */
  counts?: Record<string, number>;
  /** The public site is blocked (site_settings.maintenance_enabled). */
  maintenanceOn?: boolean;
  env?: AdminEnv;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The drawer remembers the page it was opened on, so it is closed again as
  // soon as a link inside it navigates away.
  const [drawerAt, setDrawerAt] = useState<string | null>(null);
  const drawer = drawerAt === pathname;
  const setDrawer = (open: boolean) => setDrawerAt(open ? pathname : null);
  const [palette, setPalette] = useState(false);
  const nav = useMemo(() => navFor(identity.roles, new Set(hiddenNav)), [identity.roles, hiddenNav]);
  const here = navMatch(pathname);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-shell lg:block">
          <Sidebar nav={nav} pathname={pathname} identity={identity} counts={counts} env={env} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-shell">
              <Sidebar nav={nav} pathname={pathname} identity={identity} counts={counts} env={env} onClose={() => setDrawer(false)} />
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header
            className="sticky top-0 z-30 border-b border-line bg-shell"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                className="-ml-1 rounded-md p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink lg:hidden"
                aria-label="Open menu"
              >
                <AdminIcon name="menu" className="size-5" />
              </button>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
                <span className="hidden text-ink-dim sm:inline">Admin</span>
                {here && here.section.id !== "overview" && (
                  <>
                    <span className="hidden text-line-strong sm:inline">/</span>
                    <span className="hidden text-ink-dim sm:inline">{here.section.label}</span>
                  </>
                )}
                <span className="text-line-strong">/</span>
                <span className="truncate text-ink">{here?.item.label ?? (pathname.startsWith("/admin/denied") ? "Access" : "Admin")}</span>
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPalette(true)}
                  className="flex items-center gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink-dim transition-colors hover:border-line-strong hover:text-ink"
                >
                  <AdminIcon name="search" className="size-3.5" />
                  <span className="hidden sm:inline">Jump to</span>
                  <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
                </button>
                <LagosClock />
                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] ${ENV_STYLE[env].className}`}>
                  {ENV_STYLE[env].label}
                </span>
              </div>
            </div>
            {maintenanceOn && (
              <div className="flex items-center gap-2 border-t border-amber/25 bg-amber/10 px-4 py-2 text-xs font-medium text-amber sm:px-6">
                <AdminIcon name="alert" className="size-3.5 shrink-0" />
                <span>Maintenance mode is on: visitors see the &ldquo;back soon&rdquo; page.</span>
                {nav.some((s) => s.items.some((i) => i.href === "/admin/maintenance")) && (
                  <Link href="/admin/maintenance" className="ml-auto underline underline-offset-2">
                    Manage
                  </Link>
                )}
              </div>
            )}
          </header>
          <main className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
        </div>
      </div>

      {palette && <CommandPalette nav={nav} onClose={() => setPalette(false)} />}
    </div>
  );
}

function Sidebar({
  nav,
  pathname,
  identity,
  counts,
  env,
  onClose,
}: {
  nav: NavSection[];
  pathname: string;
  identity: AdminIdentity;
  counts: Record<string, number>;
  env: AdminEnv;
  onClose?: () => void;
}) {
  const initials = (identity.email.split("@")[0] ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-5">
        <Link href="/admin" className="flex items-center gap-2.5">
          <LogoLockup className="h-[22px] w-auto text-ink" />
          <span className="sr-only">KiqStat</span>
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-muted">ADMIN</span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-muted hover:text-ink" aria-label="Close menu">
            <AdminIcon name="close" className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {nav.map((section) => (
          <div key={section.id} className="mt-4 first:mt-1">
            {section.id !== "overview" && (
              <p className="px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">{section.label}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = counts[item.href];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                        active ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2/60 hover:text-ink"
                      }`}
                    >
                      {active && <span className="absolute inset-y-1.5 -left-3 w-[3px] rounded-r bg-brand" aria-hidden />}
                      <AdminIcon name={item.icon} className={`size-4 shrink-0 ${active ? "text-brand" : "text-ink-dim group-hover:text-ink-muted"}`} />
                      <span className="truncate">{item.label}</span>
                      {count ? (
                        <span className="tnum ml-auto rounded bg-amber/15 px-1.5 font-mono text-[10px] font-medium text-amber">{count}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11px] font-medium text-ink">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-ink">{identity.email}</p>
            <p className="mt-0.5 flex flex-wrap gap-1">
              {identity.roles.map((r) => (
                <span key={r} className="rounded bg-surface-2 px-1 font-mono text-[9.5px] tracking-[0.1em] text-ink-muted" title={ROLES[r].label}>
                  {ROLES[r].short}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 px-1">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-ink-dim hover:bg-surface-2 hover:text-ink"
          >
            <AdminIcon name="external" className="size-3.5" /> Live site
          </Link>
          <form action={signOut} className="ml-auto">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-ink-dim hover:bg-surface-2 hover:text-ink"
            >
              <AdminIcon name="logout" className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
        <p className="mt-2 px-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-dim">
          {env === "production" ? "www.kiqstat.app" : env}
        </p>
      </div>
    </div>
  );
}

/** Lagos time, the clock every schedule here runs on (WAT, UTC+1). Rendered after mount to avoid a hydration mismatch. */
function LagosClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const fmt = () =>
      setNow(new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }));
    fmt();
    const t = setInterval(fmt, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tnum hidden items-center gap-1.5 font-mono text-[11px] text-ink-dim md:flex" title="Lagos time (WAT)">
      <AdminIcon name="clock" className="size-3.5" />
      {now ?? "--:--"} <span className="text-ink-dim/70">WAT</span>
    </span>
  );
}
