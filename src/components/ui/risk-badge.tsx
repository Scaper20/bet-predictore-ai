import { RISK, riskFor, type RiskLevel } from "@/lib/model/risk";

const TONE: Record<RiskLevel, string> = {
  low: "border-brand/35 text-brand",
  medium: "border-amber/40 text-amber",
  high: "border-rose/40 text-rose",
};

const DOT: Record<RiskLevel, string> = { low: "bg-brand", medium: "bg-amber", high: "bg-rose" };

/**
 * Low, medium or high risk for a pick, from its model probability
 * (lib/model/risk.ts). Outlined, with a dot, so it never reads as the filled
 * Strong badge it often sits beside. The title says what the label is based on.
 *
 * Nothing for a locked Pro pick: its probability never reaches the browser
 * (lib/access.ts lockPick zeroes it), and a band would hint at it anyway.
 */
export function RiskBadge({ pick, className = "" }: { pick: { market: string; probability: number }; className?: string }) {
  if (pick.market === "locked") return null;
  const level = riskFor(pick.probability);
  const { label, record } = RISK[level];
  return (
    <span
      title={`${record} Based on every pick we have graded.`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${TONE[level]} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[level]}`} />
      {label}
    </span>
  );
}
