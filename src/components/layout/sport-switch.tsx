"use client";

import Link from "next/link";
import { sportPath } from "@/lib/routes";
import { soonHref } from "@/lib/nav";

/**
 * Football / Basketball. Basketball isn't built yet, so its tab goes to the
 * coming-soon page with a "Soon" tag — present, so people know it's coming.
 */
export function SportSwitch({ size = "md", onNavigate }: { size?: "md" | "lg"; onNavigate?: () => void }) {
  const big = size === "lg";
  const tab = `flex items-center justify-center gap-2 rounded-[9px] font-semibold transition-colors ${
    big ? "h-10 text-sm" : "h-8 px-3 text-[13px]"
  }`;
  return (
    <div
      role="group"
      aria-label="Sport"
      className={`grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 ${big ? "w-full" : ""}`}
    >
      <Link href={sportPath("predictions", "football")} onClick={onNavigate} aria-current="true" className={`${tab} bg-brand text-brand-ink`}>
        <BallIcon />
        Football
      </Link>
      <Link href={soonHref("basketball")} onClick={onNavigate} className={`${tab} text-ink-muted hover:text-ink`}>
        <HoopIcon />
        Basketball
        <span className="rounded bg-surface-3 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-ink-dim">Soon</span>
      </Link>
    </div>
  );
}

function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5l4.3 3.1-1.6 5h-5.4l-1.6-5z" />
    </svg>
  );
}

function HoopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M6 5c2.5 2 3.5 4.5 3.5 7S8.5 17 6 19M18 5c-2.5 2-3.5 4.5-3.5 7s1 5 3.5 7" />
    </svg>
  );
}
