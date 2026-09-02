"use client";

import { useState } from "react";
import type { Prediction } from "@/lib/model/predict";
import { useSlip } from "@/lib/slip";
import { Button } from "@/components/ui/primitives";
import { odds, percent } from "@/lib/format";

/** Pick a selection from this fixture and drop it on the slip. */
export function AddToSlip({ prediction }: { prediction: Prediction }) {
  const { legs, add, remove } = useSlip();
  const { picks, match, sufficiency } = prediction;

  const existing = legs.find((l) => l.matchId === match.id);
  const options = picks.slice(0, 8);
  const [selected, setSelected] = useState(existing?.market ?? options[0]?.market ?? "");

  if (!sufficiency.publishable) {
    return (
      <section className="card p-5 sm:p-7">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Selections</h2>
        <p className="mt-3 text-xs leading-relaxed text-ink-dim">
          Selections from this fixture are not offered: there is not enough completed history in
          this competition to stand one up.
        </p>
      </section>
    );
  }

  const pick = options.find((p) => p.market === selected) ?? options[0];

  return (
    <section className="card p-5 sm:p-7">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Selections</h2>
        {existing && <span className="text-xs text-brand">On your slip</span>}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[11px] font-medium text-ink-muted">Selection</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand/50"
        >
          {options.map((p) => (
            <option key={p.market} value={p.market}>
              {p.label} — {percent(p.probability)} (fair {odds(p.fairOdds)})
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1 py-2.5"
          onClick={() =>
            pick &&
            add({
              matchId: match.id,
              fixture: `${match.home.name} v ${match.away.name}`,
              league: match.league.name,
              kickoff: match.kickoff,
              market: pick.market,
              label: pick.label,
              probability: pick.probability,
              fairOdds: pick.fairOdds,
            })
          }
        >
          {existing ? "Update selection" : "Add to selections"}
        </Button>
        {existing && (
          <Button variant="secondary" className="py-2.5" onClick={() => remove(match.id)}>
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}
