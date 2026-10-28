import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/admin-icons";

/*
 * The admin's building blocks. One look across every page: mono uppercase
 * eyebrows, hairline cards, numbers in Plex Mono, Volt spent only where a
 * figure matters.
 *
 * Chart colours (series, not status): Volt, cyan, gold, violet, in that order,
 * with neutral for "everything else". Checked with the dataviz validator on
 * the dark surface: colour-blind separation, normal-vision separation and
 * contrast pass; the lightness-band check does not, because Volt is the
 * identity colour and is brighter than the band by design. So no chart here
 * relies on colour alone: every multi-series mark has a legend and direct
 * labels.
 */

export type KitTone = "brand" | "cyan" | "gold" | "violet" | "amber" | "rose" | "neutral";

export const TONE_BG: Record<KitTone, string> = {
  brand: "bg-brand",
  cyan: "bg-cyan",
  gold: "bg-gold",
  violet: "bg-violet",
  amber: "bg-amber",
  rose: "bg-rose",
  neutral: "bg-ink-dim",
};

const TONE_TEXT: Record<KitTone, string> = {
  brand: "text-brand",
  cyan: "text-cyan",
  gold: "text-gold",
  violet: "text-violet",
  amber: "text-amber",
  rose: "text-rose",
  neutral: "text-ink-muted",
};

/* ------------------------------------------------------------------ header */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-line pb-5 sm:mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-brand">{eyebrow}</p>}
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

/** A small label above a group of panels. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dim">{children}</h2>
      <span className="h-px flex-1 bg-line" aria-hidden />
      {aside}
    </div>
  );
}

/* ------------------------------------------------------------------- panels */

export function Panel({
  title,
  meta,
  action,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  /** Small mono text beside the title: a period, a count, a timestamp. */
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding, for tables and lists that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section className={`card flex min-w-0 flex-col ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            {title && <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>}
            {meta && <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-dim">{meta}</span>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? "min-w-0 flex-1" : "min-w-0 flex-1 p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children = "Open" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-dim transition-colors hover:text-brand">
      {children} <AdminIcon name="arrow" className="size-3" />
    </Link>
  );
}

/* --------------------------------------------------------------- KPI tiles */

export interface Delta {
  /** Signed change as a fraction (0.12 = +12%), or null when there is nothing to compare with. */
  change: number | null;
  /** What it is compared with, e.g. "vs prev 30d". */
  against: string;
  /** Whether a rise is good news (revenue) or bad (open tickets). */
  upIsGood?: boolean;
  /** The change is a difference of two rates (a hit rate), shown in percentage points. */
  points?: boolean;
}

export function DeltaText({ delta }: { delta: Delta }) {
  if (delta.change === null || !Number.isFinite(delta.change)) {
    return <span className="font-mono text-[10.5px] text-ink-dim">— {delta.against}</span>;
  }
  const up = delta.change > 0;
  const flat = Math.abs(delta.change) < (delta.points ? 0.0005 : 0.005);
  const good = flat ? null : up === (delta.upIsGood ?? true);
  const tone = good === null ? "text-ink-dim" : good ? "text-brand" : "text-rose";
  const size = Math.abs(delta.change);
  const pct = delta.points ? `${(size * 100).toFixed(1)} pts` : size >= 10 ? `${Math.round(size)}×` : `${Math.round(size * 100)}%`;
  return (
    <span className="font-mono text-[10.5px]">
      <span className={tone}>
        {flat ? (delta.points ? "±0 pts" : "±0%") : `${up ? "▲" : "▼"} ${pct}`}
      </span>{" "}
      <span className="text-ink-dim">{delta.against}</span>
    </span>
  );
}

export function KpiTile({
  label,
  value,
  unit,
  delta,
  hint,
  spark,
  tone = "brand",
  icon,
  href,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: Delta;
  hint?: ReactNode;
  /** Oldest first. Drawn in the muted ink, today's point in the tile's tone. */
  spark?: number[];
  tone?: KitTone;
  icon?: AdminIconName;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">{label}</p>
        {spark && spark.length > 1 ? (
          <Sparkline values={spark} tone={tone} width={44} height={16} />
        ) : (
          icon && <AdminIcon name={icon} className={`size-3.5 shrink-0 ${TONE_TEXT[tone]}`} />
        )}
      </div>
      <p className="mt-3 truncate font-mono text-[26px] font-medium leading-none tracking-tight text-ink">
        {value}
        {unit && <span className="ml-1 text-sm text-ink-dim">{unit}</span>}
      </p>
      <div className="mt-3 min-h-4 space-y-1">
        {delta && <DeltaText delta={delta} />}
        {hint && <p className="text-[11px] leading-snug text-ink-dim">{hint}</p>}
      </div>
    </>
  );
  const cls = "card block p-4 sm:p-5";
  return href ? (
    <Link href={href} className={`${cls} card-hover`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Twelve-ish points, no axes: the shape of the trend only. The exact values live in the chart or table it summarises. */
export function Sparkline({ values, tone = "brand", width = 84, height = 28 }: { values: number[]; tone?: KitTone; width?: number; height?: number }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r={2.5} className={TONE_TEXT[tone]} fill="currentColor" stroke="var(--color-surface)" strokeWidth={2} />
    </svg>
  );
}

/* ------------------------------------------------------------ small marks */

export function StatusDot({ tone }: { tone: KitTone }) {
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${TONE_BG[tone]}`} aria-hidden />;
}

/** A labelled state: dot plus word, never colour alone. */
export function StatusPill({ tone, children }: { tone: KitTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${TONE_TEXT[tone]}`}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

/** A share of a whole, with its track a step off the surface. */
export function Meter({ value, tone = "brand", label }: { value: number; tone?: KitTone; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------------------------------------------------- category bars */

export interface BarRow {
  label: string;
  value: number;
  /** Text shown at the bar's end; defaults to the value. */
  display?: string;
  sub?: string;
}

/**
 * Ranked horizontal bars: channels, features, competitions. One series, so
 * one colour; the value sits at the end of every bar (a short list, so every
 * row is labelled).
 */
export function BarList({ rows, tone = "brand", empty = "Nothing yet." }: { rows: BarRow[]; tone?: KitTone; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-ink-dim">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink">
              {r.label}
              {r.sub && <span className="ml-2 text-ink-dim">{r.sub}</span>}
            </span>
            <span className="tnum shrink-0 font-mono text-ink-muted">{r.display ?? r.value.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className={`h-full rounded-full ${TONE_BG[tone]}`} style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface Segment {
  label: string;
  value: number;
  tone: KitTone;
}

/** Part of a whole in one bar, 2px gaps between parts, with a legend that carries every value. */
export function SegmentBar({ segments, format = (n: number) => n.toLocaleString() }: { segments: Segment[]; format?: (n: number) => string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-surface-3">
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div key={s.label} className={TONE_BG[s.tone]} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${format(s.value)}`} />
            ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs">
            <span className={`size-2 shrink-0 rounded-sm ${TONE_BG[s.tone]}`} aria-hidden />
            <span className="text-ink-muted">{s.label}</span>
            <span className="tnum ml-auto font-mono text-ink">{format(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- key/value */

export function KeyValues({ rows }: { rows: { k: ReactNode; v: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2 text-xs first:pt-0 last:pb-0">
          <dt className="text-ink-muted">{r.k}</dt>
          <dd className="tnum text-right font-mono text-ink">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ alerts */

export interface Alert {
  tone: "rose" | "amber" | "cyan";
  title: string;
  detail?: string;
  href?: string;
}

/** Things that want someone's attention today, worst first. Empty is good news, and says so. */
export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <AdminIcon name="check" className="size-4 text-brand" /> Nothing needs attention.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const body = (
          <>
            <AdminIcon name="alert" className={`mt-0.5 size-3.5 shrink-0 ${TONE_TEXT[a.tone]}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-ink">{a.title}</span>
              {a.detail && <span className="mt-0.5 block text-[11px] leading-snug text-ink-dim">{a.detail}</span>}
            </span>
            {a.href && <AdminIcon name="arrow" className="mt-0.5 size-3 shrink-0 text-ink-dim" />}
          </>
        );
        const cls = "flex items-start gap-2.5 rounded-md border border-line bg-surface-2/50 px-3 py-2.5";
        return (
          <li key={a.title}>
            {a.href ? (
              <Link href={a.href} className={`${cls} transition-colors hover:border-line-strong`}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- feed rows */

export function FeedRow({
  primary,
  secondary,
  aside,
  href,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  aside?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-ink">{primary}</p>
        {secondary && <p className="mt-0.5 truncate text-[11px] text-ink-dim">{secondary}</p>}
      </div>
      {aside && <div className="shrink-0 text-right">{aside}</div>}
    </>
  );
  const cls = "flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 first:border-t-0 sm:px-5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:bg-surface-2/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs text-ink-dim sm:px-5">{children}</p>;
}

/** "3m ago", "5h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
