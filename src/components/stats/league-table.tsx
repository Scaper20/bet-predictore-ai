"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LiveStandingRow, Outcome } from "@/lib/stats/compute";
import type { LiveTable } from "@/lib/stats/live-table";
import { Crest } from "@/components/ui/crest";
import { LiveDot } from "@/components/ui/primitives";
import { FormPips } from "@/components/stats/form-pips";
import { matchPath } from "@/lib/routes";
import { useTickingMinute } from "@/components/match/use-live-clock";
import { rebase, type Reading } from "@/lib/live-clock";

/**
 * A league table that moves while its games are on.
 *
 * With a game in play it polls /api/tables/[code] every 30 seconds (every
 * three minutes otherwise, to notice a kick-off); each
 * response is the official table plus the scores in play, so clubs climb
 * and drop as goals go in. A row that changes place slides there (FLIP:
 * measure, re-render, play the difference back to zero) and flashes green
 * or red for its direction. With nothing live it never polls.
 */
export function LeagueTable({
  initial,
  highlight = [],
  form,
  compact = false,
}: {
  initial: LiveTable;
  /** Team ids to pick out (the two clubs on a match page). */
  highlight?: string[];
  /** Last-five form by team id, shown from md up. */
  form?: Record<string, Outcome[]>;
  compact?: boolean;
}) {
  const [table, setTable] = useState(initial);
  const [moved, setMoved] = useState<Record<string, "up" | "down">>({});
  const rowsRef = useRef(new Map<string, HTMLTableRowElement>());
  const lastTops = useRef(new Map<string, number>());
  const lastPos = useRef(new Map(initial.rows.map((r) => [r.team.id, r.position])));
  // When each game's current minute was first seen, so the chips count on
  // between polls (lib/live-clock.ts). Empty until the first poll.
  const seen = useRef(new Map<string, Reading>());
  const [seenAt, setSeenAt] = useState<Record<string, number>>({});

  // Every 30s while a game is on, starting straight away (the page may be a
  // cached copy); every few minutes otherwise, to notice kick-off.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/tables/${table.code}`, { cache: "no-store" });
        if (!res.ok) return;
        const next: LiveTable = await res.json();
        if (cancelled) return;
        const changes: Record<string, "up" | "down"> = {};
        for (const r of next.rows) {
          const before = lastPos.current.get(r.team.id);
          if (before && before !== r.position) changes[r.team.id] = r.position < before ? "up" : "down";
          lastPos.current.set(r.team.id, r.position);
        }
        const at = Date.now();
        const readings = new Map<string, Reading>();
        for (const r of next.rows) {
          if (!r.live || readings.has(r.live.matchId)) continue;
          const status = r.live.halftime ? "halftime" : "live";
          readings.set(r.live.matchId, rebase(seen.current.get(r.live.matchId), { status, minute: r.live.minute, observedAt: at }));
        }
        seen.current = readings;
        setSeenAt(Object.fromEntries([...readings].map(([id, r]) => [id, r.observedAt])));
        setMoved(changes);
        setTable(next);
      } catch {
        // Keep the last good table.
      }
    };
    if (table.liveGames > 0) void poll();
    const timer = setInterval(poll, table.liveGames > 0 ? 30_000 : 180_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [table.code, table.liveGames]);

  // FLIP: play each row from where it was to where it is.
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, el] of rowsRef.current) {
      const top = el.getBoundingClientRect().top;
      const prev = lastTops.current.get(id);
      if (!reduce && prev !== undefined && prev !== top) {
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: "translateY(0)" }], {
          duration: 700,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
      lastTops.current.set(id, top);
    }
  }, [table]);

  const rows = table.rows;
  const size = rows.length;
  const zones = size >= 16;
  const hl = new Set(highlight);

  if (size === 0) {
    return <p className="px-5 py-8 text-center text-sm text-ink-dim">No table published for this competition yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">
            <th className="w-10 py-2.5 pl-4 text-left font-semibold sm:pl-5">#</th>
            <th className="py-2.5 text-left font-semibold">Team</th>
            <th className="w-8 py-2.5 text-center font-semibold">P</th>
            {!compact && <th className="hidden w-8 py-2.5 text-center font-semibold sm:table-cell">W</th>}
            {!compact && <th className="hidden w-8 py-2.5 text-center font-semibold sm:table-cell">D</th>}
            {!compact && <th className="hidden w-8 py-2.5 text-center font-semibold sm:table-cell">L</th>}
            <th className="w-10 py-2.5 text-center font-semibold">GD</th>
            {form && <th className="hidden w-32 py-2.5 text-left font-semibold md:table-cell">Form</th>}
            <th className="w-12 py-2.5 pr-4 text-right font-semibold sm:pr-5">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Row
              key={r.team.id}
              row={r}
              index={i}
              zone={zones ? (r.position <= 4 ? "top" : r.position > size - 3 ? "bottom" : null) : null}
              highlighted={hl.has(r.team.id)}
              moved={moved[r.team.id]}
              liveSince={r.live ? seenAt[r.live.matchId] : undefined}
              compact={compact}
              form={form?.[r.team.id]}
              showForm={Boolean(form)}
              refFn={(el) => {
                if (el) rowsRef.current.set(r.team.id, el);
                else rowsRef.current.delete(r.team.id);
              }}
            />
          ))}
        </tbody>
      </table>
      {zones && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-ink-dim sm:px-5">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-brand" /> Top four</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-rose" /> Bottom three</span>
          {table.liveGames > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-rose">
              <LiveDot /> Moving with {table.liveGames} {table.liveGames === 1 ? "game" : "games"} in play
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  row: r,
  index,
  zone,
  highlighted,
  moved,
  liveSince,
  compact,
  form,
  showForm,
  refFn,
}: {
  row: LiveStandingRow;
  index: number;
  zone: "top" | "bottom" | null;
  highlighted: boolean;
  moved?: "up" | "down";
  /** When the live game's minute was first seen (epoch ms). */
  liveSince?: number;
  compact: boolean;
  form?: Outcome[];
  showForm: boolean;
  refFn: (el: HTMLTableRowElement | null) => void;
}) {
  const live = r.live;
  return (
    <tr
      ref={refFn}
      className={`relative border-b border-line/70 transition-colors last:border-0 ${
        highlighted ? "bg-brand/[0.07]" : live ? "bg-signal/[0.05]" : "hover:bg-surface-2/50"
      } ${moved === "up" ? "row-moved-up" : moved === "down" ? "row-moved-down" : ""}`}
    >
      <td className="relative py-2.5 pl-4 sm:pl-5">
        {zone && <span className={`absolute inset-y-1.5 left-0 w-1 rounded-r-full ${zone === "top" ? "bg-brand" : "bg-rose"}`} aria-hidden />}
        <span className="flex items-center gap-1">
          <span className={`tnum text-xs font-semibold ${highlighted ? "text-brand" : "text-ink-muted"}`}>{r.position}</span>
          {r.movement !== 0 && (
            <span className={`text-[9px] ${r.movement > 0 ? "text-brand" : "text-rose"}`} aria-label={r.movement > 0 ? `up ${r.movement}` : `down ${-r.movement}`}>
              {r.movement > 0 ? "▲" : "▼"}
            </span>
          )}
        </span>
      </td>
      <td className="py-2.5 pr-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <Crest src={r.team.crest} name={r.team.name} size={20} />
          <span className={`min-w-0 truncate ${highlighted ? "font-bold text-ink" : "font-medium text-ink"} ${compact ? "max-w-[9rem] sm:max-w-none" : ""}`}>
            {r.team.name}
          </span>
          {live && (
            <Link
              href={matchPath(live.matchId)}
              className="flex shrink-0 items-center gap-1 rounded-md bg-rose/12 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose hover:bg-rose/20"
              title="In play — tap for the match"
            >
              <LiveDot />
              <LiveMinute live={live} since={liveSince} /> {live.for}-{live.against}
            </Link>
          )}
        </span>
      </td>
      <td className="tnum py-2.5 text-center text-ink-muted">{r.played}</td>
      {!compact && <td className="tnum hidden py-2.5 text-center text-ink-muted sm:table-cell">{r.won}</td>}
      {!compact && <td className="tnum hidden py-2.5 text-center text-ink-muted sm:table-cell">{r.drawn}</td>}
      {!compact && <td className="tnum hidden py-2.5 text-center text-ink-muted sm:table-cell">{r.lost}</td>}
      <td className={`tnum py-2.5 text-center ${r.goalDifference > 0 ? "text-brand" : r.goalDifference < 0 ? "text-rose" : "text-ink-muted"}`}>
        {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
      </td>
      {showForm && (
        <td className="hidden py-2.5 md:table-cell">{form && form.length > 0 ? <FormPips letters={form.slice(0, 5)} size="sm" index={index} /> : null}</td>
      )}
      <td className="tnum py-2.5 pr-4 text-right font-display text-base font-bold sm:pr-5">{r.points}</td>
    </tr>
  );
}

function LiveMinute({ live, since }: { live: NonNullable<LiveStandingRow["live"]>; since?: number }) {
  const minute = useTickingMinute(live.minute, live.halftime ? "halftime" : "live", since ?? Number.NaN);
  return <>{live.halftime ? "HT" : minute ? `${minute}′` : ""}</>;
}
