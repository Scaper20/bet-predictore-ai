"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Match } from "@/lib/types";
import type { SportId } from "@/lib/sports";
import { allLinks, type NavLink } from "@/lib/nav";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";
import { matchPath, sportPath } from "@/lib/routes";
import { kickoffDay, kickoffTime } from "@/lib/format";
import { useTimeZone } from "@/lib/use-visitor";
import { runNavAction } from "@/components/layout/nav-actions";

interface Result {
  key: string;
  group: "Pages" | "Leagues" | "Matches";
  label: string;
  meta?: string;
  href: string;
  soon?: boolean;
  action?: NavLink["action"];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Upcoming fixtures, fetched once on first use and shared by every search box on the page. */
let fixtures: Promise<Match[]> | null = null;
function loadFixtures(): Promise<Match[]> {
  fixtures ??= fetch("/api/fixtures?days=7")
    .then((r) => (r.ok ? r.json() : { matches: [] }))
    .then((d: { matches?: Match[] }) => d.matches ?? [])
    .catch(() => {
      fixtures = null;
      return [];
    });
  return fixtures;
}

function useSearch(sport: SportId, query: string, active: boolean) {
  const [matches, setMatches] = useState<Match[]>([]);
  const tz = useTimeZone();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void loadFixtures().then((m) => !cancelled && setMatches(m));
    return () => {
      cancelled = true;
    };
  }, [active]);

  return useMemo<Result[]>(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const pages: Result[] = allLinks(sport)
      .filter((l) => norm(`${l.label} ${l.desc ?? ""}`).includes(q))
      .slice(0, 5)
      .map((l) => ({ key: `p:${l.href}:${l.label}`, group: "Pages", label: l.label, meta: l.soon ? "Coming soon" : l.desc, href: l.href, soon: l.soon, action: l.action }));
    const leagues: Result[] = [...CLUB_LEAGUES, ...INTERNATIONAL_LEAGUES]
      .filter((l) => norm(`${l.name} ${l.shortName} ${l.country}`).includes(q))
      .slice(0, 4)
      .map((l) => ({ key: `l:${l.code}`, group: "Leagues", label: `${l.flag} ${l.name}`, meta: "Predictions", href: `${sportPath("predictions", sport)}?league=${l.code}` }));
    const games: Result[] = matches
      .filter((m) => norm(`${m.home.name} ${m.away.name} ${m.league.name}`).includes(q))
      .slice(0, 6)
      .map((m) => ({
        key: `m:${m.id}`,
        group: "Matches",
        label: `${m.home.name} v ${m.away.name}`,
        meta: `${m.league.name} · ${kickoffDay(m.kickoff, tz)} ${kickoffTime(m.kickoff, tz)}`,
        href: matchPath(m.id, sport),
      }));
    return [...games, ...leagues, ...pages];
  }, [query, matches, sport, tz]);
}

/**
 * Search for teams, leagues, matches and pages. "inline" is the header box
 * with a dropdown (press / anywhere to focus it); "sheet" lists results in
 * place, for the mobile menu.
 */
export function NavSearch({
  sport,
  variant = "inline",
  onNavigate,
}: {
  sport: SportId;
  variant?: "inline" | "sheet";
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const results = useSearch(sport, query, focused || query.length > 0);
  const open = (variant === "sheet" || focused) && query.trim().length >= 2;

  // "/" focuses the header search, unless the user is already typing somewhere.
  useEffect(() => {
    if (variant !== "inline") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant]);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (variant !== "inline" || !focused) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [variant, focused]);

  const go = (r: Result) => {
    setQuery("");
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
    onNavigate?.();
    if (r.action) runNavAction(r.action);
    else router.push(r.href);
  };

  const list = open ? (
    <div
      id={listId}
      role="listbox"
      className={
        variant === "inline"
          ? "absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-shell p-2 shadow-2xl"
          : "mt-2 space-y-1"
      }
    >
      {results.length === 0 ? (
        <p className="px-3 py-4 text-sm text-ink-muted">Nothing matches &ldquo;{query.trim()}&rdquo; yet.</p>
      ) : (
        (["Matches", "Leagues", "Pages"] as const).map((group) => {
          const rows = results.filter((r) => r.group === group);
          if (!rows.length) return null;
          return (
            <div key={group} className="py-1">
              <p className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">{group}</p>
              {rows.map((r) => {
                const i = results.indexOf(r);
                return (
                  <Link
                    key={r.key}
                    href={r.href}
                    role="option"
                    aria-selected={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      go(r);
                    }}
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${i === cursor ? "bg-surface-2" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                      {r.meta && <span className="block truncate text-xs text-ink-dim">{r.meta}</span>}
                    </span>
                    {r.soon && <SoonTag />}
                  </Link>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  ) : null;

  return (
    <div ref={box} className={`relative ${variant === "inline" ? "w-full max-w-md" : "w-full"}`}>
      <label className="flex h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-ink-dim transition-colors focus-within:border-brand/50">
        <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="sr-only">Search</span>
        <input
          ref={input}
          type="search"
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="Search teams, leagues or matches"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && results[cursor]) {
              e.preventDefault();
              go(results[cursor]);
            } else if (e.key === "Escape") {
              setQuery("");
              input.current?.blur();
              setFocused(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim [&::-webkit-search-cancel-button]:hidden"
        />
        {variant === "inline" && (
          <kbd className="hidden shrink-0 rounded-md border border-line-strong px-1.5 font-mono text-[11px] text-ink-dim xl:block">/</kbd>
        )}
      </label>
      {list}
    </div>
  );
}

export function SoonTag() {
  return (
    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-ink-dim">
      Soon
    </span>
  );
}
