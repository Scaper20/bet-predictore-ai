import { isPublishable, MIN_PUBLISHABLE_SAMPLE, type SettledRecord } from "@/lib/performance";
import { percent } from "@/lib/format";

/**
 * The two headline records, side by side: Strong picks, then every pick.
 *
 * Both are the same settled log. Strong is the subset stamped strong when it
 * was logged, before kickoff, so it can never be assembled after the fact;
 * every pick stays one glance away so nothing is hidden behind it.
 */
export function TierRecords({ strong, overall }: { strong: SettledRecord; overall: SettledRecord }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <TierCard
        title="Strong picks"
        hint="Our most confident picks, marked before kickoff"
        record={strong}
        highlight
        empty={
          strong.sample === 0
            ? "Strong picks are marked from today. The first ones grade after their games."
            : `${strong.sample} graded so far. The rate shows from ${MIN_PUBLISHABLE_SAMPLE}.`
        }
      />
      <TierCard
        title="All picks"
        hint="Every headline pick we have published"
        record={overall}
        empty={`${overall.sample} graded so far. The rate shows from ${MIN_PUBLISHABLE_SAMPLE}.`}
      />
    </section>
  );
}

function TierCard({
  title,
  hint,
  record,
  highlight = false,
  empty,
}: {
  title: string;
  hint: string;
  record: SettledRecord;
  highlight?: boolean;
  empty: string;
}) {
  const show = isPublishable(record);
  return (
    <div className={`card p-5 sm:p-6 ${highlight ? "border-amber/30 bg-amber/[0.04]" : ""}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        {highlight && <span className="text-amber" aria-hidden>★</span>}
        {title}
      </p>
      <p className="mt-0.5 text-xs text-ink-dim">{hint}</p>
      {show ? (
        <div className="mt-4 flex items-end justify-between gap-4">
          <p className={`tnum font-mono tracking-tighter text-3xl font-medium ${highlight ? "text-amber" : "text-brand"}`}>
            {percent(record.winRate ?? 0, 1)}
          </p>
          <p className="tnum text-right text-xs text-ink-muted">
            {record.wins}W – {record.losses}L
            {record.pushes > 0 && ` – ${record.pushes}P`}
            <span className="block text-ink-dim">{record.sample} graded</span>
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">{empty}</p>
      )}
    </div>
  );
}
