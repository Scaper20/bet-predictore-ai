"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PickRow } from "@/components/match/pick-row";
import { LiveScoresProvider } from "@/components/match/pick-action";
import { Badge, LiveDot } from "@/components/ui/primitives";
import type { PickRowData } from "@/lib/pick-list";

/**
 * The Picks page's list, loaded a batch at a time.
 *
 * The page sends the first batch with its HTML; when the visitor scrolls to
 * within a screen of the end, the next batch comes from /api/picks (same
 * filters, same order, so the offset lines up). Two weeks of fixtures is
 * five hundred-odd games, and nobody should download all of them to read
 * today's.
 *
 * Rows arrive already ordered into day sections; consecutive rows of the
 * same section share one heading.
 */
export function PickList({ initial, total, query }: { initial: PickRowData[]; total: number; query: string }) {
  const [rows, setRows] = useState(initial);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const done = rows.length >= total;

  const loadMore = useCallback(async () => {
    if (state === "loading" || done) return;
    setState("loading");
    try {
      const q = new URLSearchParams(query);
      q.set("offset", String(rows.length));
      const res = await fetch(`/api/picks?${q.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data: { rows: PickRowData[] } = await res.json();
      setRows((prev) => {
        // A batch can overlap if the slate moved between requests; keep the first copy.
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.rows.filter((r) => !seen.has(r.id))];
      });
      setState(data.rows.length === 0 ? "error" : "idle");
    } catch {
      setState("error");
    }
  }, [state, done, query, rows.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || state !== "idle") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, state]);

  // Consecutive rows of one section, in order.
  const sections: (PickRowData["section"] & { rows: PickRowData[] })[] = [];
  for (const r of rows) {
    const last = sections[sections.length - 1];
    if (last && last.key === r.section.key) last.rows.push(r);
    else sections.push({ ...r.section, rows: [r] });
  }

  return (
    <LiveScoresProvider matches={rows.map((r) => ({ id: r.id, kickoff: r.kickoff, status: r.status }))}>
      <div className="space-y-7">
        {sections.map((s) => (
          <section key={s.key}>
            <div className="mb-4 flex items-center gap-3">
              {s.live && <LiveDot />}
              <h2 className="font-display text-xl font-bold">{s.title}</h2>
              <Badge tone={s.live ? "rose" : "brand"}>{s.count}</Badge>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="card overflow-hidden">
              {s.rows.map((r) => (
                <PickRow key={r.id} row={r} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {!done && (
        <div ref={sentinel} className="flex justify-center py-6">
          {state === "error" ? (
            <button
              type="button"
              onClick={() => {
                setState("idle");
                void loadMore();
              }}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              Couldn&apos;t load more. Try again
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm text-ink-dim" aria-live="polite">
              <span className="size-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
              Loading more games…
            </span>
          )}
        </div>
      )}
    </LiveScoresProvider>
  );
}
