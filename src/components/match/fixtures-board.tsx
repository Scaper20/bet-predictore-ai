"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Match } from "@/lib/types";
import { Crest } from "@/components/ui/crest";
import { Badge } from "@/components/ui/primitives";
import { SlidingTabs } from "@/components/motion/sliding-tabs";
import { FixtureRow } from "@/components/match/fixture-row";
import { groupLiveMatches, searchLiveGroups, type LiveGroup } from "@/lib/live-board";
import { relativeDay } from "@/lib/format";
import { useTimeZone } from "@/lib/use-visitor";
import { CLUB_LEAGUES, INTERNATIONAL_LEAGUES } from "@/lib/leagues";

// Days are the visitor's own (lib/use-visitor.ts): a 23:00 WAT kickoff is tomorrow in Nairobi.
const dayKey = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

/**
 * Fixtures as the Live board lays out live games: pick a day, then every
 * competition that plays on it, as a card of scoreboard rows.
 *
 * The whole window is sent once and filtered here, so switching days or
 * searching is instant. A league chosen in the dropdown is a real URL
 * (?league=), because those pages are indexed under their own titles.
 */
export function FixturesBoard({ matches, league, windowDays }: { matches: Match[]; league?: string; windowDays: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tz = useTimeZone();

  const days = useMemo(() => {
    const map = new Map<string, { key: string; iso: string; count: number; live: number }>();
    for (const m of matches) {
      const k = dayKey(m.kickoff, tz);
      const d = map.get(k) ?? { key: k, iso: m.kickoff, count: 0, live: 0 };
      d.count++;
      if (m.status === "live" || m.status === "halftime") d.live++;
      map.set(k, d);
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [matches, tz]);

  const [picked, setPicked] = useState(() => days[0]?.key ?? "");
  // A league change swaps the window; fall back to its first day if the
  // picked one has no games in it.
  const day = days.some((d) => d.key === picked) ? picked : (days[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [direction, setDirection] = useState<"left" | "right">("right");

  const groups = useMemo(() => {
    const onDay = matches.filter((m) => dayKey(m.kickoff, tz) === day);
    return groupLiveMatches(onDay).map((g) => ({
      ...g,
      // The live grouping orders by clock; a day's fixtures read by kick-off.
      matches: [...g.matches].sort(
        (a, b) => liveFirst(a) - liveFirst(b) || Date.parse(a.kickoff) - Date.parse(b.kickoff),
      ),
    }));
  }, [matches, day, tz]);

  const trackedCount = groups.filter((g) => g.tracked).reduce((n, g) => n + g.matches.length, 0);
  const visible = useMemo(
    () => searchLiveGroups(topOnly ? groups.filter((g) => g.tracked) : groups, query),
    [groups, topOnly, query],
  );
  const dayTotal = groups.reduce((n, g) => n + g.matches.length, 0);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const chooseDay = (k: string) => {
    setDirection(days.findIndex((d) => d.key === k) >= days.findIndex((d) => d.key === day) ? "right" : "left");
    setPicked(k);
  };

  const chooseLeague = (code: string) => {
    const next = new URLSearchParams(params.toString());
    if (code) next.set("league", code);
    else next.delete("league");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- toolbar */}
      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone="brand">
              <span className="tnum">{matches.length}</span> fixtures
            </Badge>
            <span className="text-sm text-ink-muted">
              next <span className="tnum font-semibold text-ink">{windowDays}</span> days
              <span className="text-ink-dim"> · </span>
              <span className="tnum font-semibold text-ink">{days.length}</span> matchdays
            </span>
          </div>
          <span className="text-xs text-ink-dim">Kick-off times in your time zone</span>
        </div>

        {days.length > 0 && (
          <SlidingTabs
            ariaLabel="Day"
            value={day}
            onChange={chooseDay}
            tabs={days.map((d) => ({
              key: d.key,
              label: (
                <span className="flex flex-col items-center leading-tight">
                  <span className="text-[13px] font-semibold">{dayLabel(d.iso, tz)}</span>
                  <span className="text-[10px] font-normal text-ink-dim">{shortDate(d.iso, tz)}</span>
                </span>
              ),
              meta: d.live > 0 ? <span className="text-signal">●</span> : d.count,
            }))}
          />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Search fixtures</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a team or competition"
              className="w-full rounded-lg border border-line bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
            />
          </label>
          <div className="flex gap-3">
            {trackedCount > 0 && trackedCount < dayTotal && (
              <div className="flex shrink-0 rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Filter">
                <Segment active={!topOnly} onClick={() => setTopOnly(false)}>
                  All <span className="tnum text-ink-dim">{dayTotal}</span>
                </Segment>
                <Segment active={topOnly} onClick={() => setTopOnly(true)}>
                  Top leagues <span className="tnum text-ink-dim">{trackedCount}</span>
                </Segment>
              </div>
            )}
            <label className="min-w-0 flex-1 sm:w-52 sm:flex-none">
              <span className="sr-only">Competition</span>
              <select
                value={league ?? ""}
                onChange={(e) => chooseLeague(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand/50"
              >
                <option value="">All competitions</option>
                <optgroup label="Clubs">
                  {CLUB_LEAGUES.map((l) => (
                    <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                  ))}
                </optgroup>
                <optgroup label="National teams">
                  {INTERNATIONAL_LEAGUES.map((l) => (
                    <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
        </div>

        {visible.length > 2 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {visible.map((g) => (
              <a
                key={g.key}
                href={`#fx-${slug(g.key)}`}
                onClick={() => collapsed.has(g.key) && toggle(g.key)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {g.flag && <span aria-hidden>{g.flag}</span>}
                <span className="max-w-40 truncate">{g.shortName}</span>
                <span className="tnum text-ink-dim">{g.matches.length}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- groups */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-muted">
            {query ? (
              <>Nothing matches <span className="font-semibold text-ink">&ldquo;{query}&rdquo;</span> on {relativeDay(days.find((d) => d.key === day)?.iso ?? new Date().toISOString(), new Date(), tz)}.</>
            ) : (
              "No fixtures on this day."
            )}
          </p>
          {(query || topOnly) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTopOnly(false);
              }}
              className="mt-3 text-xs font-medium text-brand hover:underline"
            >
              Show every fixture
            </button>
          )}
        </div>
      ) : (
        <div key={day} className={`gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid ${direction === "right" ? "panel-in-right" : "panel-in-left"}`}>
          {visible.map((g) => (
            <LeagueCard key={g.key} group={g} open={!collapsed.has(g.key)} onToggle={() => toggle(g.key)} />
          ))}
        </div>
      )}
    </div>
  );
}

function liveFirst(m: Match): number {
  return m.status === "live" || m.status === "halftime" ? 0 : 1;
}

function dayLabel(iso: string, tz: string): string {
  const rel = relativeDay(iso, new Date(), tz);
  if (rel === "Today" || rel === "Tomorrow") return rel;
  return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", timeZone: tz });
}

function shortDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: tz });
}

function slug(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function LeagueCard({ group, open, onToggle }: { group: LiveGroup; open: boolean; onToggle: () => void }) {
  return (
    <section id={`fx-${slug(group.key)}`} className="card scroll-mt-[calc(var(--header-h)+1rem)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50 sm:px-5 ${open ? "border-b border-line" : ""}`}
      >
        {group.flag ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-base" aria-hidden>
            {group.flag}
          </span>
        ) : (
          <Crest src={group.logo} name={group.name} size={28} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{group.name}</span>
            {group.tracked && (
              <span className="shrink-0 rounded border border-brand/25 bg-brand/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-brand" title="KiqStat models this competition">
                Model
              </span>
            )}
          </span>
          {group.country && <span className="block truncate text-[11px] text-ink-dim">{group.country}</span>}
        </span>
        <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{group.matches.length}</span>
        <svg viewBox="0 0 20 20" className={`size-4 shrink-0 text-ink-dim transition-transform duration-300 ${open ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="stagger divide-y divide-line">
          {group.matches.map((m, i) => (
            <li key={m.id} style={{ ["--i" as string]: i }}>
              <FixtureRow match={m} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
