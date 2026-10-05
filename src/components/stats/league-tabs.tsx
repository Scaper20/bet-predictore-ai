"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export interface LeagueTab {
  code: string;
  label: string;
  flag?: string;
}

/**
 * League chips for pages that always show one competition (tables, form,
 * goals, ratings). The active chip scrolls itself into view on a phone,
 * where the row overflows.
 */
export function LeagueTabs({ leagues, active, param = "league" }: { leagues: LeagueTab[]; active: string; param?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const row = useRef<HTMLElement>(null);
  // Centre the active chip horizontally; never scrolls the page vertically.
  useEffect(() => {
    const nav = row.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && chip && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
    }
  }, [active]);
  const href = (code: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(param, code);
    return `${pathname}?${next.toString()}`;
  };
  return (
    <nav ref={row} aria-label="Competition" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {leagues.map((l) => {
        const on = l.code === active;
        return (
          <Link
            key={l.code}
            href={href(l.code)}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
              on
                ? "border-brand/40 bg-brand/12 text-brand shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_10%,transparent)]"
                : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {l.flag && <span aria-hidden>{l.flag}</span>}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
