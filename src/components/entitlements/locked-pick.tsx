import type { Pick } from "@/lib/model/predict";

/**
 * Stand-in text for a locked pick, by market group. Never the real
 * selection: the server sends a locked pick without one (lib/access.ts), so
 * the blur is decoration over a placeholder, not a veil over the answer.
 */
const PLACEHOLDER: Record<Pick["group"], string> = {
  "Match Result": "Home Win",
  Goals: "Over 2.5 Goals",
  "Both Teams To Score": "Both Teams Score",
  "Double Chance": "Home or Draw",
  "Correct Score": "2 - 1",
  "Asian Handicap": "Home -0.5",
};

export function LockIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" strokeLinecap="round" />
    </svg>
  );
}

export function ProTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-violet">
      <LockIcon className="size-3" /> PRO
    </span>
  );
}

/** The selection line of a locked pick: blurred placeholder, screen readers told it is locked. */
export function LockedSelection({ group, className = "" }: { group: Pick["group"]; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="pointer-events-none select-none blur-[6px]" aria-hidden>
        {PLACEHOLDER[group] ?? "Over 2.5 Goals"}
      </span>
      <span className="sr-only">Pro pick, locked</span>
    </span>
  );
}

/** A locked probability: a blurred stand-in percentage. */
export function LockedNumber({ className = "" }: { className?: string }) {
  return (
    <span className={`pointer-events-none select-none blur-[6px] ${className}`} aria-hidden>
      72%
    </span>
  );
}
