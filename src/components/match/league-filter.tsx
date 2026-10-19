"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES, leagueByCode, type LeagueDef } from "@/lib/leagues";
import { isProLeague } from "@/lib/pro-leagues";
import { LeagueLogo } from "@/components/ui/league-logo";

/**
 * The competitions most people come for, in the order they get a chip in the
 * row. Only those with games on the page show; the rest are in the panel.
 * Fewer show on narrower screens (see the chip classes below), so the row is
 * always one line.
 */
const FEATURED_CODES = ["premier-league", "champions-league", "la-liga", "serie-a", "bundesliga", "ligue-1", "npfl"];
const FEATURED = 5;

/**
 * The league filter: "All leagues", the handful of competitions most people
 * want, and "More leagues" for the other forty-odd in a panel.
 *
 * It used to be one chip per competition in a single row, which ran to some
 * forty chips and a long sideways scroll. Now the row fits the screen: with
 * `counts` (games per competition on the page) it leads with the biggest
 * competitions that actually have games, and the panel shows every
 * competition with its count, so nothing is hidden, only folded away. The
 * selected competition always has a chip of its own.
 *
 * `proTags` marks the Pro leagues, for a free viewer.
 */
export function LeagueFilter({ proTags = false, counts }: { proTags?: boolean; counts?: Record<string, number> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("league");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const href = (code?: string) => {
    const next = new URLSearchParams(params.toString());
    if (code) next.set("league", code);
    else next.delete("league");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const all = [...CLUB_LEAGUES, ...INTERNATIONAL_LEAGUES];
  const has = (l: LeagueDef) => !counts || (counts[l.code] ?? 0) > 0;
  const featured = FEATURED_CODES.map((c) => leagueByCode(c)).filter((l): l is LeagueDef => Boolean(l) && has(l!)).slice(0, FEATURED);
  const activeDef = active ? leagueByCode(active) : undefined;
  if (activeDef && !featured.some((l) => l.code === activeDef.code)) featured.unshift(activeDef);
  const moreCount = all.filter((l) => has(l) && !featured.includes(l)).length;

  return (
    <div ref={wrap} className="relative flex items-center gap-2">
      <Chip href={href()} active={!active} label="All leagues" />
      {featured.map((l, i) => (
        <Chip
          key={l.code}
          href={href(l.code)}
          active={active === l.code}
          label={l.shortName}
          code={l.code}
          pro={proTags && isProLeague(l.code)}
          // The selected chip always shows; the rest give way on narrow screens.
          className={active === l.code ? "" : i >= 1 ? (i >= 3 ? "hidden lg:flex" : "hidden sm:flex") : ""}
        />
      ))}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
          open ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
        }`}
      >
        {/* "More" alone on the narrowest phones, where the full label pushed the row off screen. */}
        <span className="min-[400px]:hidden">More</span>
        <span className="hidden min-[400px]:inline">More leagues</span>
        {counts && moreCount > 0 && <span className="tnum hidden rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-muted min-[400px]:inline">{moreCount}</span>}
        <svg viewBox="0 0 20 20" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="All competitions"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line-strong bg-shell p-4 shadow-2xl sm:p-5"
        >
          <Group title="Clubs" leagues={CLUB_LEAGUES} counts={counts} active={active} href={href} proTags={proTags} onPick={() => setOpen(false)} />
          <Group title="National teams" leagues={INTERNATIONAL_LEAGUES} counts={counts} active={active} href={href} proTags={false} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  leagues,
  counts,
  active,
  href,
  proTags,
  onPick,
}: {
  title: string;
  leagues: LeagueDef[];
  counts?: Record<string, number>;
  active: string | null;
  href: (code?: string) => string;
  proTags: boolean;
  onPick: () => void;
}) {
  // With counts, competitions with games lead and the empty ones follow, dimmed.
  const sorted = counts ? [...leagues].sort((a, b) => Number((counts[b.code] ?? 0) > 0) - Number((counts[a.code] ?? 0) > 0)) : leagues;
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((l) => {
          const n = counts?.[l.code] ?? 0;
          const empty = counts && n === 0;
          return (
            <Link
              key={l.code}
              href={href(l.code)}
              onClick={onPick}
              aria-current={active === l.code ? "page" : undefined}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                active === l.code ? "bg-brand/12 text-brand" : "text-ink hover:bg-surface-2"
              } ${empty ? "opacity-45" : ""}`}
            >
              <LeagueLogo code={l.code} size={22} />
              <span className="min-w-0 flex-1 truncate">{l.shortName}</span>
              {proTags && isProLeague(l.code) && <span className="rounded-full bg-violet/15 px-1.5 py-0.5 text-[9px] font-bold text-violet">PRO</span>}
              {counts && <span className="tnum text-[11px] text-ink-dim">{n || "–"}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Chip({
  href,
  active,
  label,
  code,
  pro = false,
  className = "",
}: {
  href: string;
  active: boolean;
  label: string;
  code?: string;
  pro?: boolean;
  className?: string;
}) {
  // py-2.5 over py-2 gives 42px rather than 38: a tap landing slightly off
  // costs a page navigation to undo.
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
        active
          ? "border-brand/40 bg-brand/12 text-brand"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
      } ${className}`}
    >
      {code && <LeagueLogo code={code} size={20} />}
      {label}
      {pro && (
        <span title="Pro league" className="rounded-full bg-violet/15 px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-violet">
          PRO
        </span>
      )}
    </Link>
  );
}
