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
 *
 * On a phone it is collapsed behind a disclosure. Six paragraphs of terms is
 * ~320px of a 390px screen, and nobody reads it on the way to a decision —
 * but it must still be one tap away and still in the DOM, so this is a
 * <details>, not a link somewhere else. The one line people genuinely need —
 * not a bookmaker, no guaranteed return — stays visible either way.
 *
 * Above sm the terms render open and unchanged, which is why `children`
 * appears in two branches rather than in one <details> switched by a media
 * query: the UA stylesheet hides a closed details' content (via
 * ::details-content in current engines, a non-rendered slot in older ones)
 * and forcing it back open from CSS is not reliable across browsers. Only one
 * branch is ever rendered — the other is display:none, so it is out of the
 * accessibility tree entirely and no one hears the text twice.
 */
export function LegalNote({
  title = "Important information",
  summary = "BetriX is an analytics product, not a bookmaker. No plan guarantees a return.",
  children,
}: {
  title?: string;
  /** Stays visible when collapsed. Keep it to the one sentence that matters. */
  summary?: string;
  children: ReactNode;
}) {
  return (
    <aside aria-label={title} className="card border-dashed p-5 sm:p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">{title}</h2>

      {/* sm and up: exactly what this rendered before the mobile work. */}
      <div className="mt-3 hidden space-y-2.5 text-xs leading-relaxed text-ink-dim sm:block">
        {children}
      </div>

      <div className="sm:hidden">
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">{summary}</p>
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-semibold text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Read the full terms</span>
            <span className="hidden group-open:inline">Hide the full terms</span>
            <span className="transition-transform group-open:rotate-180" aria-hidden>
              ⌄
            </span>
          </summary>
          <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-dim">{children}</div>
        </details>
      </div>
    </aside>
  );
}
