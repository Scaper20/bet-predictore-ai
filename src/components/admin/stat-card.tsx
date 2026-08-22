/** Matches the Track Record page's stat-card markup exactly, not a new
 * visual language. */
export function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="tnum mt-2 font-display text-3xl font-extrabold">{value}</p>
      {sublabel && <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">{sublabel}</p>}
    </div>
  );
}
