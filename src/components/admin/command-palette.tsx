"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NavSection } from "@/lib/admin-access";
import { AdminIcon } from "@/components/admin/admin-icons";

/**
 * ⌘K / Ctrl+K: jump to any admin page this person can open, by typing part of
 * its name or its section ("growth", "tick"). Arrow keys move, Enter opens,
 * Escape closes. Lists only the nav this person already sees.
 */
export function CommandPalette({ nav, onClose }: { nav: NavSection[]; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = nav.flatMap((s) => s.items.map((i) => ({ ...i, section: s.label })));
    if (!q) return all;
    return all.filter((i) => `${i.label} ${i.section}`.toLowerCase().includes(q));
  }, [nav, query]);

  useEffect(() => input.current?.focus(), []);

  const open = (href: string) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && items[cursor]) {
      open(items[cursor].href);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Jump to a page">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line-strong bg-shell shadow-2xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <AdminIcon name="search" className="size-4 text-ink-dim" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Jump to a page…"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-dim focus:outline-none"
            aria-label="Search pages"
            aria-activedescendant={items[cursor] ? `cmd-${items[cursor].href}` : undefined}
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-dim">No page matches &ldquo;{query}&rdquo;.</li>}
          {items.map((item, i) => (
            <li key={item.href} id={`cmd-${item.href}`} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => open(item.href)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                  i === cursor ? "bg-surface-2 text-ink" : "text-ink-muted"
                }`}
              >
                <AdminIcon name={item.icon} className={`size-4 ${i === cursor ? "text-brand" : "text-ink-dim"}`} />
                <span className="flex-1">{item.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{item.section}</span>
                {i === cursor && <AdminIcon name="arrow" className="size-3.5 text-ink-dim" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
