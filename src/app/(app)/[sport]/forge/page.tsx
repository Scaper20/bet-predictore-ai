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
      {/* The page explains itself; the heading stays for screen readers and search. */}
      <h1 className="sr-only">BetriX Forge — build my slip</h1>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand sm:mb-6">BetriX Forge</p>
      <ForgeStudio />
    </div>
  );
}
