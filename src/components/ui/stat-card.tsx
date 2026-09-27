/**
 * A single headline number.
 *
 * Lifted out of components/admin/ unchanged, because it was never
 * admin-specific — it already matched the Track Record page's stat markup,
 * and the account dashboard is the third surface to want it. The admin
 * version now re-exports this one so there is a single definition.
 */
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
