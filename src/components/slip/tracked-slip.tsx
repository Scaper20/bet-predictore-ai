"use client";

import type { ReactNode } from "react";
import { kickoffDay, kickoffTime } from "@/lib/format";
import {
  combinedProbability,
  legState,
  slipStatus,
  type LegScore,
  type LegState,
  type SlipStatus,
  type TrackedLeg,
} from "@/lib/slip-tracker";
import type { TrackedSlip } from "@/lib/tracked-slips";
import { useTickingMinute } from "@/components/match/use-live-clock";

/* ----------------------------------------------------------------- shared */

export interface SlipView {
  legs: { leg: TrackedLeg; state: LegState }[];
  status: SlipStatus;
  combined: number;
  settled: number;
  landed: number;
}

export function viewSlip(slip: TrackedSlip, scores: Record<string, LegScore>, now = Date.now()): SlipView {
  const legs = slip.legs.map((leg) => ({
    leg,
    state: legState(leg, slip.results[leg.matchId], scores[leg.matchId], now),
  }));
  const states = legs.map((l) => l.state);
  return {
    legs,
    status: slipStatus(states),
    combined: combinedProbability(slip.legs),
    settled: states.filter((s) => s.kind === "settled").length,
    landed: states.filter((s) => s.kind === "settled" && s.result.grade === "win").length,
  };
}

/** 78% for a round number, 74.6% otherwise — never a trailing ".0". */
function pct(p: number): string {
  return `${Number((p * 100).toFixed(1))}%`;
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function kickoffLabel(iso: string): string {
  return `${kickoffDay(iso)}, ${kickoffTime(iso)}`;
}

function kickoffRange(legs: TrackedLeg[]): string {
  const days = [...new Set(legs.map((l) => kickoffDay(l.kickoff)))];
  return days.length === 1 ? `${days[0]}` : `${days[0]} to ${days[days.length - 1]}`;
}

type Tone = "brand" | "rose" | "amber" | "neutral";

/** The colour a leg (or segment) wears for its state. */
function legTone(state: LegState): Tone {
  if (state.kind === "settled") {
    return state.result.grade === "win" ? "brand" : state.result.grade === "lose" ? "rose" : "neutral";
  }
  if (state.kind === "live") return "amber";
  return "neutral";
}

const SEGMENT: Record<Tone, string> = {
  brand: "bg-brand",
  rose: "bg-rose",
  amber: "bg-amber",
  neutral: "bg-line-strong",
};

const LEG_BORDER: Record<Tone, string> = {
  brand: "border-brand/30",
  rose: "border-rose/45",
  amber: "border-amber/45",
  neutral: "border-line",
};

function Segments({ view, className = "h-1.5" }: { view: SlipView; className?: string }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {view.legs.map(({ leg, state }) => (
        <span key={leg.matchId} className={`${className} flex-1 rounded-full ${SEGMENT[legTone(state)]}`} />
      ))}
    </div>
  );
}

function CheckIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.2l2 1.3" strokeLinecap="round" />
    </svg>
  );
}

const PILL_TONES: Record<Tone | "brand-solid", string> = {
  brand: "border-brand/40 text-brand",
  "brand-solid": "border-brand bg-brand text-brand-ink",
  rose: "border-rose/50 text-rose",
  amber: "border-amber/50 text-amber",
  neutral: "border-line-strong text-ink-muted",
};

function Pill({
  tone,
  children,
  size = "md",
}: {
  tone: Tone | "brand-solid";
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-mono font-semibold uppercase tracking-wider ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]"
      } ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function SlipStatusPill({ status, size = "md" }: { status: SlipStatus; size?: "sm" | "md" }) {
  switch (status) {
    case "won":
      return (
        <Pill tone="brand-solid" size={size}>
          <CheckIcon /> Slip won
        </Pill>
      );
    case "lost":
      return (
        <Pill tone="rose" size={size}>
          <CrossIcon /> Slip lost
        </Pill>
      );
    case "live":
      return (
        <Pill tone="amber" size={size}>
          <span className="size-1.5 rounded-full bg-amber" /> Live
        </Pill>
      );
    case "void":
      return (
        <Pill tone="neutral" size={size}>
          Void
        </Pill>
      );
    default:
      return (
        <Pill tone="neutral" size={size}>
          <ClockIcon /> Pending
        </Pill>
      );
  }
}

function LegBadge({ state }: { state: LegState }) {
  if (state.kind === "settled") {
    if (state.result.grade === "win") {
      return (
        <Pill tone="brand" size="sm">
          <CheckIcon /> Won
        </Pill>
      );
    }
    if (state.result.grade === "lose") {
      return (
        <Pill tone="rose" size="sm">
          <CrossIcon /> Lost
        </Pill>
      );
    }
    return (
      <Pill tone="neutral" size="sm">
        Void
      </Pill>
    );
  }
  if (state.kind === "live") {
    if (state.onTrack === false) {
      return (
        <Pill tone="rose" size="sm">
          <span className="size-1.5 rounded-full bg-rose" /> Off track
        </Pill>
      );
    }
    return (
      <Pill tone="amber" size="sm">
        <span className="size-1.5 rounded-full bg-amber" /> On track
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" size="sm">
      {state.kind === "unknown" ? "Awaiting" : "Pending"}
    </Pill>
  );
}

function LegClock({ leg, state }: { leg: TrackedLeg; state: LegState }) {
  const live = state.kind === "live" ? state.score : null;
  // A hook, so it runs for every leg; it only counts for one in play.
  const minute = useTickingMinute(live?.minute, live?.status ?? "scheduled", live?.observedAt ?? Number.NaN);
  if (state.kind === "settled") {
    const { abandoned } = state.result;
    return <>{abandoned === "postponed" ? "Postponed" : abandoned === "cancelled" ? "Cancelled" : "Full time"}</>;
  }
  if (live) {
    if (live.status === "halftime") return <>Half time</>;
    return <>{minute ? `${minute}′` : "Live"}</>;
  }
  return <>{kickoffLabel(leg.kickoff)}</>;
}

function legGoals(state: LegState): [number | null, number | null] | null {
  if (state.kind === "settled") return state.result.abandoned ? null : [state.result.home, state.result.away];
  if (state.kind === "live") return [state.score.home, state.score.away];
  return null;
}

/* ------------------------------------------------------------- full card */

function LegCard({ leg, state }: { leg: TrackedLeg; state: LegState }) {
  const tone = legTone(state);
  const goals = legGoals(state);
  const lost = state.kind === "settled" && state.result.grade === "lose";

  return (
    <div className={`rounded-xl border bg-surface/60 p-4 sm:p-5 ${LEG_BORDER[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 gap-1.5 pt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-muted">
          <span className="min-w-0 truncate">{leg.league}</span>
          <span className="shrink-0">· <LegClock leg={leg} state={state} /></span>
        </p>
        <LegBadge state={state} />
      </div>

      <div className="mt-3 space-y-1">
        {[leg.homeName, leg.awayName].map((team, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-base font-medium text-ink sm:text-lg">{team}</span>
            {goals && (
              <span className="tnum font-mono text-base font-semibold text-ink sm:text-lg">{goals[i] ?? "–"}</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className={`min-w-0 truncate text-sm font-semibold ${lost ? "text-ink-dim line-through" : "text-ink"}`}>
          {leg.label}
        </span>
        <span className={`tnum shrink-0 font-mono text-sm ${lost ? "text-ink-muted" : "text-brand"}`}>
          Model {pct(leg.probability)}
        </span>
      </div>
    </div>
  );
}

function Headline({ view }: { view: SlipView }) {
  const n = view.legs.length;
  const chance = pct(view.combined);

  if (view.status === "won") {
    return (
      <>
        <h2 className="mt-2 font-display text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
          <span className="text-brand">
            {view.landed}/{n}
          </span>{" "}
          landed.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
          The model gave this slip a {chance} combined chance. This time it came in.
        </p>
      </>
    );
  }
  if (view.status === "pending") {
    const legs = view.legs.map((l) => l.leg);
    const count = NUMBER_WORDS[n] ?? String(n);
    return (
      <>
        <h2 className="mt-2 font-display text-5xl font-extrabold leading-none tracking-tight sm:text-6xl">
          Locked in.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
          {n === 1
            ? `One selection, read off the model. Kicks off ${kickoffLabel(legs[0].kickoff)}, West Africa Time.`
            : `${count} selections, each read off the model. Kickoffs ${kickoffRange(legs)}, West Africa Time.`}
        </p>
      </>
    );
  }
  return (
    <p className="mt-2 text-sm leading-relaxed text-ink-muted sm:text-base">
      {view.status === "live"
        ? "Scores update straight from the live feed. Nothing to refresh."
        : view.status === "void"
          ? "Every selection on this slip was voided."
          : `The model gave this slip a ${chance} combined chance.`}
    </p>
  );
}

function Stat({ label, value, accent = false }: { label: ReactNode; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface/60 px-3 py-3 sm:px-4">
      <p className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-dim">{label}</p>
      <p className={`tnum mt-1 font-display text-2xl font-bold sm:text-3xl ${accent ? "text-brand" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

export function TrackedSlipCard({ view }: { view: SlipView }) {
  const n = view.legs.length;
  const first =
    view.status === "pending"
      ? { label: "Selections", value: String(n) }
      : view.status === "lost"
        ? { label: "Landed", value: `${view.landed} / ${n}` }
        : { label: "Settled", value: `${view.settled} / ${n}` };

  return (
    <article className="card p-5 sm:p-7">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-green-96.png" alt="" width={36} height={36} className="size-9 rounded-xl" aria-hidden />
          <span className="font-display text-xl font-bold tracking-tight">
            Betri<span className="text-brand">X</span>
          </span>
        </div>
        <SlipStatusPill status={view.status} />
      </header>

      <p className="mt-6 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
        Selection slip · {n} {n === 1 ? "leg" : "legs"}
      </p>
      <Headline view={view} />

      <div className="mt-5">
        <Segments view={view} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
        <Stat label={first.label} value={first.value} />
        <Stat
          label={
            <>
              <span className="sm:hidden">Combined</span>
              <span className="hidden sm:inline">Combined prob.</span>
            </>
          }
          value={pct(view.combined)}
          accent
        />
      </div>

      <div className="mt-4 space-y-3">
        {view.legs.map(({ leg, state }) => (
          <LegCard key={leg.matchId} leg={leg} state={state} />
        ))}
      </div>

      <footer className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Built on betrix.com.ng</p>
          <p className="mt-0.5 text-xs text-ink-dim">Probabilities, not guarantees. Bet responsibly.</p>
        </div>
        <span className="shrink-0 rounded-md border border-line-strong px-2 py-1 text-xs font-bold text-ink-muted">
          18+
        </span>
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------- minimized row */

function rowSummary(view: SlipView): string {
  const n = view.legs.length;
  switch (view.status) {
    case "won":
      return `${view.landed}/${n} landed`;
    case "lost":
      return `${view.landed}/${n} landed`;
    case "live":
      return `${view.settled}/${n} settled`;
    case "void":
      return "Voided";
    default: {
      const next = view.legs[0]?.leg.kickoff;
      return next ? `First kickoff ${kickoffLabel(next)}` : "";
    }
  }
}

export function TrackedSlipRow({ view, onOpen, onShare }: { view: SlipView; onOpen: () => void; onShare?: () => void }) {
  const n = view.legs.length;
  return (
    <article className="card card-hover min-w-0 overflow-hidden">
    <button
      type="button"
      onClick={onOpen}
      className="block w-full min-w-0 p-4 pb-3 text-left sm:p-5 sm:pb-3"
      aria-label={`Open slip with ${n} ${n === 1 ? "selection" : "selections"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand">
          {n} {n === 1 ? "leg" : "legs"} · {pct(view.combined)}
        </p>
        <SlipStatusPill status={view.status} size="sm" />
      </div>

      <ul className="mt-3 space-y-2">
        {view.legs.slice(0, 3).map(({ leg, state }) => (
          <li key={leg.matchId} className="flex min-w-0 items-start gap-2">
            <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${SEGMENT[legTone(state)]}`} aria-hidden />
            {/* Fixture over pick, each on its own line: side by side, two long
                names left neither room on a phone. */}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{leg.fixture}</span>
              <span
                className={`block truncate text-xs ${
                  state.kind === "settled" && state.result.grade === "lose" ? "text-ink-dim line-through" : "text-ink-muted"
                }`}
              >
                {leg.label}
              </span>
            </span>
          </li>
        ))}
        {n > 3 && <li className="pl-3.5 text-xs text-ink-dim">+{n - 3} more</li>}
      </ul>

      <div className="mt-4">
        <Segments view={view} className="h-1" />
      </div>
    </button>
      {/* Its own row, outside the card's tap area: a button can't sit inside another. */}
      <div className="flex items-center justify-between gap-3 px-4 pb-4 sm:px-5">
        <p className="min-w-0 truncate text-xs text-ink-dim">{rowSummary(view)}</p>
        {onShare && <ShareButton onClick={onShare} />}
      </div>
    </article>
  );
}

/** Opens the share overlay for a slip (components/slip/share-slip-sheet.tsx). */
export function ShareButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border border-brand/40 bg-brand/10 px-4 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand/20 ${className}`}
    >
      Share
    </button>
  );
}
