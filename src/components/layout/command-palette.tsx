"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SportId } from "@/lib/sports";
import type { NavAction } from "@/lib/nav";
import { sportPath } from "@/lib/routes";
import { ProductIcon } from "@/components/icons/product-icon";
import { OPEN_PALETTE_EVENT, runNavAction } from "@/components/layout/nav-actions";
import { SoonTag, useSearch, type Result } from "@/components/layout/nav-search";

type IconName = Parameters<typeof ProductIcon>[0]["name"];

interface Quick {
  key: string;
  label: string;
  hint: string;
  icon: IconName;
  href: string;
  action?: NavAction;
}

/** The site's main jobs, in the order people reach for them. Mirrors the bottom nav and header. */
function quickActions(sport: SportId): Quick[] {
  return [
    { key: "picks", label: "Today's picks", hint: "Predictions", icon: "target", href: sportPath("predictions", sport) },
    { key: "live", label: "Live scores", hint: "Scores", icon: "calendar", href: sportPath("live", sport) },
    { key: "forge", label: "Build a combo", hint: "Forge", icon: "bolt", href: sportPath("forge", sport) },
    { key: "hub", label: "Today's codes", hint: "Code Hub", icon: "ticket", href: sportPath("codeHub", sport) },
    { key: "combos", label: "My combos", hint: "Tracking", icon: "chart", href: sportPath("trackedSlips", sport) },
    { key: "ask", label: "Ask KiqStat", hint: "Ask", icon: "search", href: "#ask", action: "ask" },
    { key: "record", label: "Track record", hint: "Every pick, graded", icon: "medal", href: sportPath("trackRecord", sport) },
    { key: "pricing", label: "Plans and pricing", hint: "Pricing", icon: "star", href: "/pricing" },
  ];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ⌘K / Ctrl+K anywhere on the site: the main jobs as quick actions, and the
 * header search (teams, players, matches, leagues, pages) as you type.
 * Arrow keys move, Enter opens, Escape closes. Keyboard-driven, so it barely
 * animates: it is the thing power users open twenty times a day.
 */
export function CommandPalette({ sport }: { sport: SportId }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Portalled to <body>: it is mounted inside the header, and the header's
  // backdrop-filter would otherwise be its containing block and backdrop
  // root (no blur behind it, and fixed positioning relative to the header).
  return open ? createPortal(<Palette sport={sport} onClose={() => setOpen(false)} />, document.body) : null;
}

type Row =
  | { kind: "quick"; key: string; item: Quick }
  | { kind: "result"; key: string; item: Result };

function Palette({ sport, onClose }: { sport: SportId; onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const results = useSearch(sport, query, true);
  const quick = useMemo(() => quickActions(sport), [sport]);

  const rows = useMemo<Row[]>(() => {
    const q = norm(query.trim());
    const qs = quick.filter((a) => !q || norm(`${a.label} ${a.hint}`).includes(q)).map((item) => ({ kind: "quick" as const, key: `q:${item.key}`, item }));
    const rs = q.length >= 2 ? results.map((item) => ({ kind: "result" as const, key: item.key, item })) : [];
    return [...rs, ...qs];
  }, [query, quick, results]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const choose = (row: Row) => {
    onClose();
    const { href, action } = row.item;
    if (action) runNavAction(action);
    else router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      choose(rows[cursor]);
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command menu">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 glass-scrim" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong glass-panel" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Type a command or search…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-dim focus:outline-none"
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            aria-label="Type a command or search"
            aria-activedescendant={rows[cursor] ? `cmdk-${rows[cursor].key}` : undefined}
          />
          <kbd className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-2xs text-ink-dim">ESC</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-ink-dim">Nothing matches &ldquo;{query.trim()}&rdquo; yet.</li>
          )}
          {rows.map((row, i) => {
            const group = row.kind === "quick" ? "Quick actions" : row.item.group;
            const head = group !== lastGroup;
            lastGroup = group;
            const active = i === cursor;
            return (
              <li key={row.key} role="presentation">
                {head && <p className="px-3 pb-1 pt-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-ink-dim">{group}</p>}
                <button
                  type="button"
                  id={`cmdk-${row.key}`}
                  role="option"
                  aria-selected={active}
                  tabIndex={-1}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => choose(row)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active ? "bg-surface-3 text-ink" : "text-ink-muted"}`}
                >
                  {row.kind === "quick" ? (
                    <span className={`grid size-7 shrink-0 place-items-center rounded-md ${active ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-dim"}`}>
                      <ProductIcon name={row.item.icon} className="size-4" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{row.item.label}</span>
                    {row.kind === "result" && row.item.meta && <span className="block truncate text-xs text-ink-dim">{row.item.meta}</span>}
                  </span>
                  {row.kind === "result" && row.item.soon && <SoonTag />}
                  <span className="shrink-0 text-2xs text-ink-dim">{row.kind === "quick" ? row.item.hint : null}</span>
                  {active && <kbd className="shrink-0 rounded border border-line px-1 font-mono text-2xs text-ink-dim">↵</kbd>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-2xs text-ink-dim">
          <span><kbd className="font-mono">↑↓</kbd> move</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
}
