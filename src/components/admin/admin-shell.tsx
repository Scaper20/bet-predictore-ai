"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminIdentity } from "@/lib/admin";
import { signOut } from "@/app/actions/auth";
import { ButtonLink } from "@/components/ui/primitives";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/tickets", label: "Tickets" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/model-performance", label: "Model performance" },
  { href: "/admin/team", label: "Team" },
];

export function AdminShell({
  identity,
  children,
}: {
  identity: AdminIdentity;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex max-w-[100rem]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-shell lg:flex">
          <div className="px-5 py-6">
            <span className="font-display text-lg font-bold tracking-tight">
              Betri<span className="text-brand">X</span>
            </span>
            <p className="mt-0.5 text-xs text-ink-dim">Admin</p>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink hover:bg-surface-2"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line p-4">
            <p className="truncate text-xs text-ink-muted">{identity.email}</p>
            <div className="mt-2 flex items-center gap-3">
              <Link href="/" className="text-xs text-ink-dim underline underline-offset-2 hover:text-ink">
                View live site
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-xs text-ink-dim underline underline-offset-2 hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-line bg-shell lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-display text-base font-bold">
                Betri<span className="text-brand">X</span> Admin
              </span>
              <ButtonLink href="/" variant="ghost" className="px-3 py-1.5 text-xs">
                Live site
              </ButtonLink>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
              {NAV.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </header>
          <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
