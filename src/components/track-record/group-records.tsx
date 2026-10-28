import { isPublishable, MIN_PUBLISHABLE_SAMPLE, type SettledRecord } from "@/lib/performance";
import { percent } from "@/lib/format";
import { ENGINE_GROUPS, type EngineGroup } from "@/lib/model/headline-engine";

/**
 * "More predictions" graded per market: each game's best result, goals,
 * team goals, corners and shots pick, logged before kick-off beside the
 * headline (engine_picks). A group shows its rate from MIN_PUBLISHABLE_SAMPLE.
 */
export function GroupRecords({ records }: { records: Map<EngineGroup, SettledRecord> }) {
  if ([...records.values()].every((r) => r.sample === 0)) return null;
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-sm font-semibold">More predictions, by market</h2>
      <p className="mt-0.5 text-xs text-ink-dim">Each game&rsquo;s best pick per market, at 1.20 or more on SportyBet, logged before kickoff</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-5">
        {ENGINE_GROUPS.map((g) => {
          const r = records.get(g.id);
          const show = isPublishable(r);
          return (
            <li key={g.id} className="rounded-lg border border-line p-3">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-dim">{g.label}</p>
              {show && r ? (
                <>
                  <p className="tnum mt-1 font-mono text-xl font-medium tracking-tighter text-brand">{percent(r.winRate ?? 0, 1)}</p>
                  <p className="tnum text-[11px] text-ink-muted">
                    {r.wins}W – {r.losses}L{r.pushes > 0 && ` – ${r.pushes}P`}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-ink-muted">
                  {r?.sample ?? 0} graded. Shows from {MIN_PUBLISHABLE_SAMPLE}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
