"use client";

import { useState, type ReactNode } from "react";

export interface ChipTab {
  key: string;
  label: ReactNode;
  /** A Pro section, marked on its chip. */
  pro?: boolean;
  node: ReactNode;
}

/**
 * Sections one at a time: a row of chips over a single panel, instead of a
 * long scroll through all of them (a match's markets, the Code Hub's won and
 * lost codes). Each panel is rendered on the server and stays in the
 * document (the others are `hidden`), so search engines still read all of
 * it and switching is instant.
 */
export function ChipTabs({
  sections,
  ariaLabel,
  variant = "chips",
}: {
  sections: ChipTab[];
  ariaLabel: string;
  /** "segmented" for a second row of tabs inside a panel that already sits under chips. */
  variant?: "chips" | "segmented";
}) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3">
      {variant === "segmented" ? (
        <nav aria-label={ariaLabel} className="no-scrollbar flex gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === active}
              onClick={() => setActive(s.key)}
              className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${s.key === active ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      ) : (
        <nav aria-label={ariaLabel} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(s.key)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  on ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {s.label}
                {s.pro && <span className="rounded bg-violet/15 px-1 text-[9px] font-bold uppercase tracking-wider text-violet">Pro</span>}
              </button>
            );
          })}
        </nav>
      )}
      {sections.map((s) => (
        <div key={s.key} role="region" aria-label={typeof s.label === "string" ? s.label : s.key} hidden={s.key !== active}>
          {s.node}
        </div>
      ))}
    </div>
  );
}
