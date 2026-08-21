"use client";

import { useState } from "react";
import { useSlip } from "@/lib/slip";
import { BOOKMAKERS, formatForBookmaker } from "@/lib/bookmakers";
import { Gate } from "@/components/entitlements/gate";

/**
 * "Quick-Slip" — not a real bookmaker booking code. Generating an actual code
 * that a bookie's app would recognise requires an official partner API from
 * that bookmaker, which doesn't exist yet (and reverse-engineering their
 * private endpoints was explicitly ruled out — fragile, against their ToS,
 * and risks BetriX being blocked). This is the honest version: it tells you
 * exactly which menu and selection to tap in the bookmaker's own app, so
 * building the slip by hand takes seconds instead of guesswork. See
 * src/lib/bookmakers/types.ts for the adapter shape a real per-bookmaker
 * `generateBookingCode` could plug into later.
 */
export function QuickSlip() {
  const { legs } = useSlip();
  const [bookmakerId, setBookmakerId] = useState(BOOKMAKERS[0].id);
  const [copied, setCopied] = useState(false);

  if (legs.length === 0) return null;

  const bookmaker = BOOKMAKERS.find((b) => b.id === bookmakerId) ?? BOOKMAKERS[0];
  const rows = legs.map((leg) => ({ leg, formatted: formatForBookmaker(bookmaker, leg) }));

  const asText = [
    `BetriX Quick-Slip — ${bookmaker.name}`,
    ...rows.map(({ leg, formatted }) =>
      formatted ? `${formatted.fixture} — ${formatted.menu} — ${formatted.selection}` : `${leg.fixture} — ${leg.label}`
    ),
    "",
    "Search each fixture, open the listed menu, add the listed selection.",
  ].join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the text is still selectable/visible below.
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Quick-Slip</h2>
        <span className="shrink-0 text-xs text-ink-dim">Paste-ready selections</span>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-ink-dim">
        Not an auto-loaded bet code — no bookmaker currently offers BetriX that hook. This tells you exactly what to
        tap in their app, matched to your slip.
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <BookmakerTab bookmaker={BOOKMAKERS[0]} active={bookmakerId === BOOKMAKERS[0].id} onSelect={setBookmakerId} />
        <Gate
          requires="pass"
          fallback={
            <div className="flex flex-wrap gap-1.5 opacity-50">
              {BOOKMAKERS.slice(1).map((b) => (
                <span key={b.id} className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs">
                  🔒 {b.name}
                </span>
              ))}
            </div>
          }
        >
          {BOOKMAKERS.slice(1).map((b) => (
            <BookmakerTab key={b.id} bookmaker={b} active={bookmakerId === b.id} onSelect={setBookmakerId} />
          ))}
        </Gate>
      </div>

      <ul className="space-y-2.5">
        {rows.map(({ leg, formatted }) => (
          <li key={leg.matchId} className="rounded-lg bg-surface-2 px-3.5 py-3 text-sm">
            <p className="truncate font-medium">{leg.fixture}</p>
            {formatted ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                <span className="text-ink-dim">{formatted.menu}</span> → {formatted.selection}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-ink-dim">{leg.label}</p>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={copyAll}
        className="mt-5 w-full rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-3"
      >
        {copied ? "Copied ✓" : `Copy for ${bookmaker.name}`}
      </button>
    </section>
  );
}

function BookmakerTab({
  bookmaker,
  active,
  onSelect,
}: {
  bookmaker: { id: string; name: string };
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(bookmaker.id)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-brand/40 bg-brand/10 text-brand" : "border-line bg-surface-2 text-ink-muted hover:text-ink"
      }`}
    >
      {bookmaker.name}
    </button>
  );
}
