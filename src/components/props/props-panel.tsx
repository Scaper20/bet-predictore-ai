"use client";

import { useEffect, useState } from "react";
import { PropCard, PropsEmpty, PropsUpsell, PROPS_NOTE } from "@/components/props/prop-card";
import { PROP_MARKETS, PROP_SPECS, type PropMarketKey } from "@/lib/model/player-props";
import type { PropRow } from "@/lib/props-view";

type State = { state: "loading" } | { state: "ready"; paid: boolean; live: boolean; rows: PropRow[] } | { state: "error" };

/**
 * A game's or a player's props, loaded for the viewer's plan from /api/props
 * (the page around it stays cached). Market chips filter; picks lead.
 */
export function PropsPanel({ matchId, playerId, emptyText }: { matchId?: string; playerId?: string; emptyText: string }) {
  const [data, setData] = useState<State>({ state: "loading" });
  const [market, setMarket] = useState<PropMarketKey | "picks" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = matchId ? `match=${encodeURIComponent(matchId)}` : `player=${playerId}`;
    fetch(`/api/props?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { paid: boolean; live: boolean; rows: PropRow[] }) => {
        if (!cancelled) setData({ state: "ready", paid: d.paid, live: d.live, rows: Array.isArray(d.rows) ? d.rows : [] });
      })
      .catch(() => {
        if (!cancelled) setData({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, playerId]);

  const rows = data.state === "ready" ? data.rows : [];
  const markets = PROP_MARKETS.filter((m) => rows.some((r) => r.market === m));
  const withPicks = rows.filter((r) => r.hasPick);
  const active: PropMarketKey | "picks" | null = market ?? (withPicks.length ? "picks" : markets[0] ?? null);
  const shown = (active === "picks" ? withPicks : rows.filter((r) => r.market === active))
    .slice()
    .sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (b.mean ?? 0) - (a.mean ?? 0) || a.playerName.localeCompare(b.playerName));

  if (data.state === "loading") {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-40 animate-pulse bg-surface-2/50" />)}
      </div>
    );
  }
  if (data.state === "error") return <PropsEmpty text="Player props couldn't load just now. Try again in a minute." />;
  if (rows.length === 0) return <PropsEmpty text={emptyText} />;

  const chips: { key: PropMarketKey | "picks"; label: string }[] = [
    ...(withPicks.length ? [{ key: "picks" as const, label: `Picks · ${withPicks.length}` }] : []),
    ...markets.map((m) => ({ key: m, label: PROP_SPECS[m].label })),
  ];

  return (
    <div className="space-y-4">
      {!data.paid && <PropsUpsell />}
      {!data.live && (
        <p className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-xs text-ink-muted">
          Picks are in their trial run: logged and graded privately until the record proves out. Projections are live.
        </p>
      )}
      <nav aria-label="Prop markets" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={c.key === active}
            onClick={() => setMarket(c.key)}
            className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
              c.key === active ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>
      <div key={String(active)} className="stagger grid gap-3 sm:grid-cols-2">
        {shown.map((r, i) => (
          <div key={`${r.playerId}|${r.market}`} style={{ ["--i" as string]: i }}>
            <PropCard row={r} showMatch={!matchId} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-dim">{PROPS_NOTE}</p>
    </div>
  );
}
