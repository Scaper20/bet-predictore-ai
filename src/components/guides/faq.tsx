"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface FaqItem {
  q: string;
  a: ReactNode;
  /** Plain text of the answer, for search. */
  text: string;
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

/**
 * Searchable FAQ. Each answer opens with a height animation (the grid-rows
 * 0fr → 1fr trick, so it eases to the content's real height) and the
 * chevron turns; search filters across every group as you type.
 */
export function Faq({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => `${i.q} ${i.text}`.toLowerCase().includes(term)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  return (
    <div className="space-y-8">
      <label className="relative block">
        <span className="sr-only">Search the help centre</span>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="9" cy="9" r="5.5" />
          <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: payments, passes, predictions, Forge…"
          className="w-full rounded-2xl border border-line bg-surface px-12 py-4 text-base text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
        />
      </label>

      {shown.length === 0 && <p className="text-sm text-ink-muted">Nothing matches &ldquo;{q}&rdquo;. Try another word, or message support below.</p>}

      {shown.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-[calc(var(--header-h)+1.5rem)]">
          <h2 className="mb-3 font-display text-xl font-bold">{g.title}</h2>
          <div className="stagger card divide-y divide-line overflow-hidden">
            {g.items.map((item, i) => {
              const key = `${g.id}:${i}`;
              const isOpen = open === key || (q.trim().length > 1 && shown.length === 1 && g.items.length === 1);
              return (
                <div key={key} style={{ ["--i" as string]: i }}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : key)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/50"
                  >
                    <span className="flex-1 text-[15px] font-semibold text-ink">{item.q}</span>
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full border border-line transition-all duration-300 ${isOpen ? "rotate-45 border-brand/40 bg-brand/10 text-brand" : "text-ink-dim"}`} aria-hidden>
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className={`px-5 pb-5 text-sm leading-relaxed text-ink-muted transition-opacity duration-500 ${isOpen ? "opacity-100" : "opacity-0"}`}>{item.a}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
