import type { Outcome } from "@/lib/stats/compute";

const TONE: Record<Outcome, string> = {
  W: "bg-brand text-brand-ink",
  D: "bg-surface-3 text-ink-muted",
  L: "bg-rose/85 text-white",
};

/**
 * W/D/L pips, most recent on the left. Each pops in a beat after the last
 * (--p); `index` staggers whole rows on long tables (--i).
 */
export function FormPips({
  letters,
  size = "md",
  index = 0,
  titles,
}: {
  letters: Outcome[];
  size?: "sm" | "md";
  index?: number;
  /** Per-pip tooltip, e.g. "2-1 v Arsenal". */
  titles?: string[];
}) {
  const box = size === "sm" ? "size-4 text-[9px]" : "size-5 text-[10px]";
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Form, latest first: ${letters.join(" ")}`}>
      {letters.map((l, p) => (
        <span
          key={p}
          title={titles?.[p]}
          className={`pip grid shrink-0 place-items-center rounded-[5px] font-bold ${box} ${TONE[l]}`}
          style={{ ["--p" as string]: p, ["--i" as string]: index }}
        >
          {l}
        </span>
      ))}
    </span>
  );
}
