/** Marks a Strong pick (src/lib/model/tiers.ts): confidence 60+, decided before kickoff. */
export function StrongBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 h-5 rounded-full bg-amber/15 px-2 text-[10px] leading-none font-bold uppercase tracking-wider text-amber ${className}`}
    >
      <span aria-hidden>★</span> Strong
    </span>
  );
}
