import { LOCKUP_VIEWBOX, MARK_BALL, MARK_NEEDLE, MARK_RING, MARK_VIEWBOX, WORDMARK, WORDMARK_TRANSFORM } from "@/lib/brand-mark";

/**
 * The KiqStat mark and lockup, drawn inline so they take the page's colours:
 * the ring and wordmark follow the text colour and the needle and ball use
 * --color-logo-accent (Volt on dark, the text colour on light, per the
 * identity board's "two colours on dark, one colour everywhere else").
 * Geometry lives in lib/brand-mark.ts.
 */

function MarkShapes() {
  return (
    <>
      <path d={MARK_RING} fill="currentColor" />
      <path d={MARK_NEEDLE} fill="var(--color-logo-accent)" />
      <circle {...MARK_BALL} fill="var(--color-logo-accent)" />
    </>
  );
}

/** The Q on its own: favicons, tight spaces, phones under 380px. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className} aria-hidden focusable="false">
      <MarkShapes />
    </svg>
  );
}

/** Mark and wordmark side by side, the primary lockup. Height sets the size. */
export function LogoLockup({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg viewBox={LOCKUP_VIEWBOX} className={className} aria-hidden focusable="false">
      <MarkShapes />
      <path transform={WORDMARK_TRANSFORM} d={WORDMARK} fill="currentColor" />
    </svg>
  );
}
