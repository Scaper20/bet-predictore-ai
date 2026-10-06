/** Marks a Strong pick (src/lib/model/tiers.ts): confidence 60+, decided before kickoff. */
export function StrongBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber ${className}`}
    >
      <span aria-hidden>★</span> Strong
    </span>
  );
}
