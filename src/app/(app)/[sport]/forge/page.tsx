import type { Metadata } from "next";
import { ForgeStudio } from "@/components/forge/forge-studio";
import { containerClass } from "@/components/ui/container";

export const metadata: Metadata = {
  alternates: { canonical: "/football/forge" },
  title: "KiqStat Forge — Build My Combo",
  description:
    "Tell KiqStat how you like to pick — safe, balanced or risky, the combined price you want, how many games — " +
    "and Forge builds the combo from the model's own numbers, with market prices where they're listed.",
};

export default function ForgePage() {
  return (
    <div className={`${containerClass()} pb-10 pt-6 sm:pt-10`}>
      {/* The page explains itself; the heading stays for screen readers and search. */}
      <h1 className="sr-only">KiqStat Forge — build my combo</h1>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand sm:mb-6">KiqStat Forge</p>
      <ForgeStudio />
    </div>
  );
}
