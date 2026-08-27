"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV = [
  { href: "/live", label: "Live" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/predictions", label: "Predictions" },
  { href: "/trends", label: "Trends" },
  { href: "/track-record", label: "Track Record" },
  { href: "/slip", label: "Selections" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">
            Betri<span className="text-brand">X</span>
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
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
          <AccountLink />
          <ThemeToggle />
          <ButtonLink href="/predictions" variant="primary" className="px-4 py-2">
            Get Today&apos;s Picks
          </ButtonLink>
        </div>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <AccountLink />
          <ThemeToggle />
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
      </div>

      {open && (
        <nav className="border-t border-line bg-canvas px-4 pb-4 pt-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <ButtonLink href="/predictions" className="mt-2 w-full">
            Get Today&apos;s Picks
          </ButtonLink>
        </nav>
      )}
    </header>
  );
}

function AccountLink() {
  return (
    <Link
      href="/account"
      className="grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label="Account"
      title="Account"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3.5" />
        <path strokeLinecap="round" d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    </Link>
  );
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/icon-green-96.png" alt="" width={32} height={32} className="size-8 rounded-lg" aria-hidden />
  );
}
