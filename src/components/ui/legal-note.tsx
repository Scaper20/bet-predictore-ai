import type { ReactNode } from "react";

/**
 * A block of commercial or legal small print.
 *
 * Separate from the footer's 18+ block on purpose. That one is a site-wide
 * regulatory notice — Nigeria's NLRC expects it visible on anything
 * betting-adjacent — and it appears on every page. This is contextual terms
 * for whatever it sits under: what you are buying, what happens when it
 * expires, how to get out of it. Repeating the 18+ wording here would train
 * people to skip both, so this cross-links to /responsible-gambling instead.
 *
 * `<aside>` with a label rather than a bare div, so a screen-reader user can
 * find it as "Important information" and skip past it when they don't want it.
 */
export function LegalNote({
  title = "Important information",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside aria-label={title} className="card border-dashed p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">{title}</h2>
      <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-dim">{children}</div>
    </aside>
  );
}
