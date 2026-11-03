"use client";

import { useState } from "react";
import type { ShotPoint } from "@/lib/match-details-core";

const SITUATION: Record<string, string> = {
  RegularPlay: "Open play",
  FastBreak: "Counter-attack",
  FromCorner: "From a corner",
  SetPiece: "Set piece",
  FreeKick: "Direct free kick",
  Penalty: "Penalty",
  ThrowInSetPiece: "From a throw-in",
  IndividualPlay: "Individual play",
};
const SHOT_TYPE: Record<string, string> = { RightFoot: "Right foot", LeftFoot: "Left foot", Header: "Header", OtherBodyParts: "Other" };

/**
 * Every shot on one pitch: home attacking right, away attacking left. Size is
 * the chance's xG, a filled dot a goal, a ring on target, faint off target.
 * Tap or hover a shot for who, when and how good a chance it was.
 */
export function ShotMap({
  shots,
  homeName,
  awayName,
  xg,
  single = false,
  title = "Shot map",
}: {
  shots: ShotPoint[];
  homeName: string;
  awayName: string;
  xg: { home: number | null; away: number | null };
  /** One player's or one side's shots only: no second total, all attacking right. */
  single?: boolean;
  title?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  if (shots.length === 0) return null;
  const shot = picked !== null ? shots[picked] : null;
  const count = (side: "home" | "away") => shots.filter((s) => s.side === side).length;
  const goals = (side: "home" | "away") => shots.filter((s) => s.side === side && s.goal).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
        <Legend />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 sm:px-5">
        <SideTotal name={homeName} shots={count("home")} goals={goals("home")} xg={xg.home} tone="brand" />
        {!single && <SideTotal name={awayName} shots={count("away")} goals={goals("away")} xg={xg.away} tone="cyan" right />}
      </div>
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-5">
        <svg viewBox="0 0 105 68" className="w-full overflow-visible rounded-lg" role="group" aria-label={single ? `Shot map: ${homeName}, attacking right` : `Shot map: ${homeName} attack right, ${awayName} attack left`}>
          <rect width="105" height="68" rx="1.5" className="fill-surface-2" />
          <g className="stroke-line-strong" fill="none" strokeWidth="0.3">
            <rect x="0.5" y="0.5" width="104" height="67" />
            <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
            <circle cx="52.5" cy="34" r="9.15" />
            <rect x="0.5" y="13.85" width="16.5" height="40.3" />
            <rect x="0.5" y="24.85" width="5.5" height="18.3" />
            <rect x="88" y="13.85" width="16.5" height="40.3" />
            <rect x="99" y="24.85" width="5.5" height="18.3" />
          </g>
          {shots.map((s, i) => {
            const home = s.side === "home";
            const cx = home ? (s.x / 100) * 105 : 105 - (s.x / 100) * 105;
            const cy = home ? (s.y / 100) * 68 : 68 - (s.y / 100) * 68;
            const r = 0.9 + Math.sqrt(Math.max(s.xg ?? 0.04, 0.01)) * 3.4;
            const color = home ? "var(--color-brand)" : "var(--color-cyan)";
            const active = picked === i;
            const label = `${s.player ?? "Shot"}, ${s.minute ?? "?"}', ${s.goal ? "goal" : s.onTarget ? "on target" : "off target"}${s.xg !== null ? `, xG ${s.xg.toFixed(2)}` : ""}`;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={active ? r + 0.8 : r}
                fill={s.goal ? color : s.onTarget ? `color-mix(in oklab, ${color} 30%, transparent)` : "transparent"}
                stroke={color}
                strokeOpacity={s.goal || s.onTarget ? 1 : 0.55}
                strokeWidth={active ? 0.7 : 0.4}
                className="shot-dot cursor-pointer outline-none transition-[r,stroke-width] duration-200 focus-visible:stroke-ink"
                style={{ ["--i" as string]: i }}
                tabIndex={0}
                role="button"
                aria-label={label}
                aria-pressed={active}
                onMouseEnter={() => setPicked(i)}
                onFocus={() => setPicked(i)}
                onClick={() => setPicked(active ? null : i)}
              >
                <title>{label}</title>
              </circle>
            );
          })}
        </svg>
        <div className="mt-3 min-h-[3.25rem] rounded-xl border border-line bg-surface-2 px-3.5 py-2.5" aria-live="polite">
          {shot ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {shot.player ?? "Unknown"} <span className="tnum font-mono text-xs font-normal text-ink-dim">{shot.minute}&apos;</span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {[shot.situation && (SITUATION[shot.situation] ?? shot.situation), shot.type && (SHOT_TYPE[shot.type] ?? shot.type)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-bold ${shot.goal ? "text-brand" : shot.onTarget ? "text-ink" : "text-ink-dim"}`}>
                  {shot.goal ? "Goal" : shot.onTarget ? "Saved" : "Off target"}
                </p>
                {shot.xg !== null && <p className="tnum font-mono text-xs text-ink-muted">xG {shot.xg.toFixed(2)}</p>}
              </div>
            </div>
          ) : (
            <p className="py-1 text-xs text-ink-dim">Tap a shot for who took it and how good the chance was.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SideTotal({ name, shots, goals, xg, tone, right }: { name: string; shots: number; goals: number; xg: number | null; tone: "brand" | "cyan"; right?: boolean }) {
  return (
    <div className={right ? "text-right" : ""}>
      <p className={`flex items-center gap-1.5 truncate text-xs font-semibold ${right ? "justify-end" : ""}`}>
        <span className={`size-2 shrink-0 rounded-full ${tone === "brand" ? "bg-brand" : "bg-cyan"}`} aria-hidden />
        <span className="truncate">{name}</span>
      </p>
      <p className="tnum mt-0.5 font-mono text-xs text-ink-muted">
        {shots} shots · {goals} goals{xg !== null ? ` · xG ${xg.toFixed(2)}` : ""}
      </p>
    </div>
  );
}

function Legend() {
  return (
    <span className="hidden items-center gap-3 text-[10.5px] text-ink-dim sm:flex" aria-hidden>
      <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-ink-muted" /> Goal</span>
      <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border border-ink-muted bg-ink-muted/30" /> On target</span>
      <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border border-ink-muted/60" /> Off</span>
      <span>Size = xG</span>
    </span>
  );
}
