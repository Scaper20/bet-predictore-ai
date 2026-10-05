import type { Metadata } from "next";
import { ForgeStudio } from "@/components/forge/forge-studio";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/forge" },
  title: "BetriX Forge — Build My Slip",
  description:
    "Tell BetriX how you bet — safe, balanced or risky, the odds you want, how many games — and Forge builds the " +
    "slip from the model's own numbers, with SportyBet prices where they're listed.",
};

export default function ForgePage() {
  return (
    <div className={`${containerClass()} pb-10 pt-6 sm:pt-10`}>
      <div className="mb-6 sm:mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">BetriX Forge</p>
        <h1 className="font-display text-3xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
          Tell us how you bet. We&apos;ll build the slip.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Pick a style, the odds you&apos;re after and how many games. Forge reads every modelled fixture in your
          window and builds the slip that fits — then you keep, swap or drop games until it&apos;s yours.
        </p>
      </div>
      <ForgeStudio />
    </div>
  );
}
