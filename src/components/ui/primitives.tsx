import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* ------------------------------------------------------------------ Badges */

export type Tone = "brand" | "neutral" | "live" | "amber" | "cyan" | "violet" | "rose";

const TONES: Record<Tone, string> = {
  brand: "bg-brand/12 text-brand border-brand/25",
  neutral: "bg-surface-2 text-ink-muted border-line",
  live: "bg-rose/12 text-rose border-rose/30",
  amber: "bg-amber/12 text-amber border-amber/25",
  cyan: "bg-cyan/12 text-cyan border-cyan/25",
  violet: "bg-violet/12 text-violet border-violet/25",
  rose: "bg-rose/12 text-rose border-rose/25",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function LiveDot() {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      <span className="live-dot absolute inset-0 rounded-full bg-rose" />
    </span>
  );
}

/* ----------------------------------------------------------------- Buttons */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTONS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink hover:bg-brand-strong glow-brand font-semibold",
  secondary:
    "bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2",
  danger:
    "bg-rose/12 text-rose border border-rose/30 hover:bg-rose/20 font-semibold",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none ${BUTTONS[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  onClick,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  /**
   * Optional side effect on navigation. Added for the mobile drawer, which
   * has to close itself when a CTA inside it is followed — the chrome lives
   * in the layout, so a client-side navigation does not unmount it and the
   * panel would otherwise still be open on the next page.
   */
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm transition-colors ${BUTTONS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/** Inline loading indicator — a growing, fading ring in `currentColor`, so it
 * inherits whatever text color it's dropped into (a button label, a muted
 * status line, etc.) and reads as the same visual language as the live-match
 * pulse dot rather than a generic spinner. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} role="status" aria-label="Loading">
      <span className="absolute inset-0 rounded-full bg-current opacity-20" />
      <span className="spinner-ring absolute inset-0 rounded-full bg-current" />
    </span>
  );
}

/* ------------------------------------------------------------------- Meter */

/**
 * Horizontal probability bar.
 *
 * Used everywhere a percentage appears so that the same number always looks
 * the same, which makes cards scannable at a glance.
 */
export function ProbabilityBar({
  value,
  tone = "brand",
  label,
  sublabel,
}: {
  value: number;
  tone?: Tone;
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value * 100));
  const fill: Record<Tone, string> = {
    brand: "bg-brand",
    neutral: "bg-ink-dim",
    live: "bg-rose",
    amber: "bg-amber",
    cyan: "bg-cyan",
    violet: "bg-violet",
    rose: "bg-rose",
  };

  return (
    <div>
      {(label || sublabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <span className="text-xs text-ink-muted">{label}</span>}
          {sublabel && <span className="tnum text-xs font-semibold text-ink">{sublabel}</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "probability"}
      >
        <div
          className={`bar-fill h-full rounded-full ${fill[tone]} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Form */

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50 disabled:opacity-50 ${className}`}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-dim">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------ Empty states */

export function EmptyState({
  title,
  description,
  action,
  icon = "○",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="card grid place-items-center px-6 py-10 sm:py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-surface-2 text-xl text-ink-dim">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- Section head */

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}
