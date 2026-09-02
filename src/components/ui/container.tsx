import type { ReactNode } from "react";

/**
 * The one horizontal container for the whole site.
 *
 * This replaces `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`, which had been
 * copy-pasted into 25 files — so changing the page width meant a 25-file
 * sweep, and the deviations that had crept in (max-w-lg on /account,
 * max-w-6xl on billing) read as accidents rather than decisions.
 *
 * Widths are complete literal class strings in a Record, exactly like TONES
 * and BUTTONS in primitives.tsx, so Tailwind's scanner sees every one of them.
 * `page` and `shell` resolve through --container-* tokens in globals.css; the
 * rest stay stock utilities because they're type measures, not page widths.
 *
 * Vertical rhythm deliberately stays at the call site: landing sections,
 * in-app pages, the footer and auth pages have four genuinely different
 * rhythms, and folding them in here would just move 25 decisions into one
 * file without removing any of them.
 */

const WIDTHS = {
  /** Data pages, landing sections, header, footer. */
  page: "max-w-page",
  /** Dashboards that earn the extra width — /account, the live board. */
  shell: "max-w-shell",
  /** Long-form copy, where measure matters more than available width. */
  prose: "max-w-3xl",
  narrow: "max-w-2xl",
  /** Auth forms. Deliberately tight — widening these helps nobody. */
  form: "max-w-sm",
} as const;

export type ContainerWidth = keyof typeof WIDTHS;

/**
 * px-4 stays on mobile: at that size thumb space is worth more than symmetry.
 * The ramp continuing past `lg` is what absorbs viewports above the cap, so
 * the page gains air on a wide monitor instead of letterboxing.
 */
const GUTTER = "px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16";

/** For the few callers that need the string rather than the element. */
export function containerClass(width: ContainerWidth = "page"): string {
  return `mx-auto w-full ${WIDTHS[width]} ${GUTTER}`;
}

export function Container({
  width = "page",
  className = "",
  children,
}: {
  width?: ContainerWidth;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`${containerClass(width)} ${className}`}>{children}</div>;
}
