"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Crest } from "@/components/ui/crest";

interface Team {
  id: string;
  name: string;
  crest?: string;
  scope?: string;
}

/**
 * Two club pickers that put the choice in the URL (?a=&b=), so a head-to-head
 * is a link anyone can share. Each picker searches as you type, debounced,
 * and is a proper combobox: arrow keys move, Enter picks, Escape closes.
 */
export function TeamPicker({ a, b }: { a?: Team; b?: Team }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (slot: "a" | "b", team: Team | null) => {
    const next = new URLSearchParams(params.toString());
    if (team) next.set(slot, team.id);
    else next.delete(slot);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const swap = () => {
    const next = new URLSearchParams(params.toString());
    if (a) next.set("b", a.id);
    else next.delete("b");
    if (b) next.set("a", b.id);
    else next.delete("a");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <Search label="First team" value={a} onPick={(t) => set("a", t)} />
      <button
        type="button"
        onClick={swap}
        disabled={!a && !b}
        className="mx-auto grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-ink-muted transition-all duration-300 hover:rotate-180 hover:border-brand/40 hover:text-brand disabled:opacity-40"
        aria-label="Swap teams"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 4 3 7l3 3M3 7h11M14 16l3-3-3-3M17 13H6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Search label="Second team" value={b} onPick={(t) => set("b", t)} />
    </div>
  );
}

function Search({ label, value, onPick }: { label: string; value?: Team; onPick: (t: Team | null) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Team[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data: { teams: Team[] } = await res.json();
        setResults(data.teams);
        setCursor(0);
      } catch {
        // aborted or offline
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (t: Team) => {
    onPick(t);
    setQ("");
    setOpen(false);
  };

  if (value && !open) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/[0.06] px-3.5 py-3">
        <Crest src={value.crest} name={value.name} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{label}</span>
          <span className="block truncate font-semibold">{value.name}</span>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-brand hover:underline">
          Change
        </button>
      </div>
    );
  }

  const shown = q.trim().length >= 2 ? results : [];

  return (
    <div ref={box} className="relative">
      <label className="sr-only" htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={Boolean(value)}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, shown.length - 1));
          else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === "Enter" && shown[cursor]) pick(shown[cursor]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={`${label}: search a club or country`}
        className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-brand/50"
      />
      {loading && <span className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />}
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" className="animate-menu-in absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-auto rounded-xl border border-line bg-shell p-1 shadow-2xl">
          {shown.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(t)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${i === cursor ? "bg-surface-2 text-ink" : "text-ink-muted"}`}
              >
                <Crest src={t.crest} name={t.name} size={24} />
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                {t.scope && <span className="shrink-0 text-[11px] capitalize text-ink-dim">{t.scope}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
