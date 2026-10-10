"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Match } from "@/lib/types";
import { Crest } from "@/components/ui/crest";
import { Badge, EmptyState, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { matchPath, sportPath } from "@/lib/routes";
import { groupLiveMatches, matchProgress, searchLiveGroups, type LiveGroup } from "@/lib/live-board";
import { useTickingMinute } from "@/components/match/use-live-clock";
import { rebase, type Reading } from "@/lib/live-clock";

/** How long a row stays highlighted after a goal. */
const GOAL_FLASH_MS = 90_000;

/** When each game's minute on screen was first seen (epoch ms), by match id; the row clocks count on from it. */
const SeenAt = createContext<ReadonlyMap<string, number>>(new Map());

const readings = (matches: Match[], at: number, prev?: Map<string, Reading>) =>
  new Map(matches.map((m) => [m.id, rebase(prev?.get(m.id), { status: m.status, minute: m.minute ?? null, observedAt: at })]));

type GoalFlash = { side: "home" | "away"; at: number };

/**
 * Live score board.
 *
 * Polls rather than opening a socket: the upstream feeds are themselves
 * polled, so a socket would add moving parts without adding freshness. The
 * interval backs off while the tab is hidden so a forgotten tab does not burn
 * through the free-tier request budget.
 *
 * Matches are grouped by competition (lib/live-board.ts) and drawn as
 * compact scoreboard rows, so a busy matchday reads as a handful of
 * leagues rather than one long wall of cards.
 */
export function LiveBoard({ initial, initialAt }: { initial: Match[]; initialAt: number }) {
  const [matches, setMatches] = useState(initial);
  // The server's readings, made once; the poll carries them forward.
  const [firstSeen] = useState(() => readings(initial, initialAt));
  const [seenAt, setSeenAt] = useState<ReadonlyMap<string, number>>(() => new Map(initial.map((m) => [m.id, initialAt])));
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failing, setFailing] = useState(false);
  const [goals, setGoals] = useState<Record<string, GoalFlash>>({});
  const [query, setQuery] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // Last known score per match, to spot goals between polls.
  const lastScores = useRef(new Map(initial.map((m) => [m.id, m.score])));

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let seen = firstSeen;

    const tick = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data: { matches: Match[]; updatedAt?: string } = await res.json();
        if (cancelled) return;

        const now = Date.now();
        // The response can sit in the CDN for a while; its own timestamp says
        // how old its minutes are.
        seen = readings(data.matches, Date.parse(data.updatedAt ?? "") || now, seen);
        setSeenAt(new Map([...seen].map(([id, r]) => [id, r.observedAt])));
        const scored: Record<string, GoalFlash> = {};
        for (const m of data.matches) {
          const before = lastScores.current.get(m.id);
          if (before) {
            if ((m.score.home ?? 0) > (before.home ?? 0)) scored[m.id] = { side: "home", at: now };
            else if ((m.score.away ?? 0) > (before.away ?? 0)) scored[m.id] = { side: "away", at: now };
          }
          lastScores.current.set(m.id, m.score);
        }
        setGoals((prev) => {
          const kept = Object.fromEntries(Object.entries(prev).filter(([, g]) => now - g.at < GOAL_FLASH_MS));
          return { ...kept, ...scored };
        });
        setMatches(data.matches);
        setUpdatedAt(new Date());
        setFailing(false);
      } catch {
        // Keep showing the last good board; a blip should not blank the page.
        if (!cancelled) setFailing(true);
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, document.hidden ? 120_000 : 30_000);
        }
      }
    };

    timer = setTimeout(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [firstSeen]);

  const groups = useMemo(() => groupLiveMatches(matches), [matches]);
  const trackedCount = useMemo(
    () => groups.filter((g) => g.tracked).reduce((n, g) => n + g.matches.length, 0),
    [groups],
  );
  const visible = useMemo(
    () => searchLiveGroups(topOnly ? groups.filter((g) => g.tracked) : groups, query),
    [groups, topOnly, query],
  );

  if (matches.length === 0) {
    return (
      <EmptyState
        icon="⏱"
        title="No matches in play right now"
        description="Nothing in play right now."
        action={<ButtonLink href={sportPath("fixtures")} variant="secondary">See upcoming fixtures</ButtonLink>}
      />
    );
  }

  const totalGoals = matches.reduce((n, m) => n + (m.score.home ?? 0) + (m.score.away ?? 0), 0);
  const allCollapsed = visible.length > 0 && visible.every((g) => collapsed.has(g.key));
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <SeenAt.Provider value={seenAt}>
    <div className="space-y-5">
      {/* ---------------------------------------------------------- toolbar */}
      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Badge tone="live">
              <LiveDot />
              <span className="tnum">{matches.length}</span> live
            </Badge>
            <span className="text-sm text-ink-muted">
              <span className="tnum font-semibold text-ink">{groups.length}</span>{" "}
              {groups.length === 1 ? "competition" : "competitions"}
              <span className="text-ink-dim"> · </span>
              <span className="tnum font-semibold text-ink">{totalGoals}</span> {totalGoals === 1 ? "goal" : "goals"} so far
            </span>
          </div>
          <RefreshStatus failing={failing} updatedAt={updatedAt} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">Search live matches</span>
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
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

          {trackedCount > 0 && trackedCount < matches.length && (
            <div className="flex shrink-0 rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Filter">
              <Segment active={!topOnly} onClick={() => setTopOnly(false)}>
                All <span className="tnum text-ink-dim">{matches.length}</span>
              </Segment>
              <Segment active={topOnly} onClick={() => setTopOnly(true)}>
                Top leagues <span className="tnum text-ink-dim">{trackedCount}</span>
              </Segment>
            </div>
          )}
        </div>

        {visible.length > 2 && (
          <div className="flex items-center gap-3">
            <div className="no-scrollbar -mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {visible.map((g) => (
                <a
                  key={g.key}
                  href={`#live-${slug(g.key)}`}
                  onClick={() => {
                    if (collapsed.has(g.key)) toggle(g.key);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  {g.flag && <span aria-hidden>{g.flag}</span>}
                  <span className="max-w-40 truncate">{g.shortName}</span>
                  <span className="tnum text-ink-dim">{g.matches.length}</span>
                </a>
              ))}
            </div>
            {visible.length > 3 && (
              <button
                type="button"
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(visible.map((g) => g.key)))}
                className="hidden shrink-0 text-xs font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline sm:block"
              >
                {allCollapsed ? "Expand all" : "Collapse all"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- groups */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-muted">
            No live match matches <span className="font-semibold text-ink">&ldquo;{query}&rdquo;</span>
            {topOnly && " in the top leagues"}.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTopOnly(false);
            }}
            className="mt-3 text-xs font-medium text-brand hover:underline"
          >
            Show every live match
          </button>
        </div>
      ) : (
        <div className="gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
          {visible.map((g) => (
            <LeagueGroup
              key={g.key}
              group={g}
              open={!collapsed.has(g.key)}
              onToggle={() => toggle(g.key)}
              goals={goals}
            />
          ))}
        </div>
      )}
    </div>
    </SeenAt.Provider>
  );
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

function RefreshStatus({ failing, updatedAt }: { failing: boolean; updatedAt: Date | null }) {
  return (
    <span className="flex items-center gap-2 text-xs text-ink-dim">
      <span className={`size-1.5 rounded-full ${failing ? "bg-amber" : "bg-brand"}`} aria-hidden />
      {failing
        ? "Reconnecting — showing the last good scores"
        : updatedAt
          ? `Updated ${updatedAt.toLocaleTimeString("en-NG", { hour12: false })} · refreshes every 30s`
          : "Refreshes every 30s"}
    </span>
  );
}

/* ------------------------------------------------------------- one league */

function LeagueGroup({
  group,
  open,
  onToggle,
  goals,
}: {
  group: LiveGroup;
  open: boolean;
  onToggle: () => void;
  goals: Record<string, GoalFlash>;
}) {
  return (
    <section id={`live-${slug(group.key)}`} className="card scroll-mt-[calc(var(--header-h)+1rem)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50 sm:px-5 ${
          open ? "border-b border-line" : ""
        }`}
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
              <span
                className="shrink-0 rounded border border-brand/25 bg-brand/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-brand"
                title="KiqStat models this competition — open a match for live win probability"
              >
                Model
              </span>
            )}
          </span>
          {group.country && <span className="block truncate text-[11px] text-ink-dim">{group.country}</span>}
        </span>
        <span className="tnum shrink-0 rounded-full bg-rose/10 px-2 py-0.5 text-[11px] font-semibold text-rose">
          {group.matches.length}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`size-4 shrink-0 text-ink-dim transition-transform ${open ? "" : "-rotate-90"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="divide-y divide-line">
          {group.matches.map((m) => (
            <li key={m.id}>
              <LiveRow match={m} goal={goals[m.id]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- one row */

function LiveRow({ match, goal }: { match: Match; goal?: GoalFlash }) {
  const { home, away } = match.score;
  const leader = home !== null && away !== null && home !== away ? (home > away ? "home" : "away") : null;

  return (
    <Link
      href={matchPath(match.id)}
      className={`group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors sm:px-5 ${
        goal ? "bg-brand/[0.07] hover:bg-brand/10" : "hover:bg-surface-2/60"
      }`}
    >
      <Clock match={match} />

      <div className="min-w-0 space-y-1.5">
        <Team team={match.home} leading={leader === "home"} scored={goal?.side === "home"} />
        <Team team={match.away} leading={leader === "away"} scored={goal?.side === "away"} />
      </div>

      <div className="flex items-center gap-2.5">
        <div className="space-y-1.5 text-right">
          <Score value={home} leading={leader === "home"} />
          <Score value={away} leading={leader === "away"} />
        </div>
        <svg
          viewBox="0 0 20 20"
          className="hidden size-4 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

function Clock({ match }: { match: Match }) {
  const halftime = match.status === "halftime";
  // NaN for a game not yet stamped: shown as reported, not counted on.
  const minute = useTickingMinute(match.minute, match.status, useContext(SeenAt).get(match.id) ?? Number.NaN);
  const progress = matchProgress({ ...match, minute });
  return (
    <div className="flex flex-col items-start gap-1.5">
      {halftime ? (
        <span className="rounded-md border border-amber/30 bg-amber/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber">
          HT
        </span>
      ) : (
        <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-rose">
          <LiveDot />
          <span className="tnum">{minute ? `${minute}′` : "Live"}</span>
        </span>
      )}
      <span className="h-0.5 w-9 overflow-hidden rounded-full bg-line" aria-hidden>
        <span
          className={`block h-full rounded-full ${halftime ? "bg-amber" : "bg-rose/70"}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </span>
    </div>
  );
}

function Team({ team, leading, scored }: { team: Match["home"]; leading: boolean; scored: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Crest src={team.crest} name={team.name} size={20} />
      <span className={`min-w-0 truncate text-sm ${leading ? "font-semibold text-ink" : "text-ink-muted"}`}>
        {team.name}
      </span>
      {scored && (
        <span className="shrink-0 rounded bg-brand px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand-ink">
          Goal
        </span>
      )}
    </div>
  );
}

function Score({ value, leading }: { value: number | null; leading: boolean }) {
  return (
    <span className={`tnum block text-base font-bold leading-5 ${leading ? "text-brand" : "text-ink"}`}>
      {value ?? 0}
    </span>
  );
}
