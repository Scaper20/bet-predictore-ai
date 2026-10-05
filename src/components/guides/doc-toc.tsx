"use client";

import { useEffect, useState } from "react";

/**
 * Contents for a long page. On a phone it is a row of chips; from lg up a
 * sticky list whose marker slides to the section in view (an
 * IntersectionObserver picks the topmost visible section).
 */
export function DocToc({ items }: { items: { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0]);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [items]);

  const index = Math.max(0, items.findIndex((i) => i.id === active));

  return (
    <>
      <nav aria-label="On this page" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
              active === it.id ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted"
            }`}
          >
            {it.title}
          </a>
        ))}
      </nav>
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-[calc(var(--header-h)+1.5rem)]">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">On this page</p>
          <div className="relative border-l border-line">
            <span
              aria-hidden
              className="absolute -left-px w-0.5 rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ height: "2rem", transform: `translateY(${index * 2.25}rem)` }}
            />
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className={`flex h-8 items-center truncate pl-4 text-sm transition-colors ${active === it.id ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"}`}
                  >
                    {it.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
    </>
  );
}
