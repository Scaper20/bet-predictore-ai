"use client";

import { toggleAsk, useAskState } from "@/lib/ask-store";

const Icon = () => (
  <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
  </svg>
);

/** Opens the Ask BetriX panel. Full label on desktop, icon on phones. */
export function AskButton({ compact = false }: { compact?: boolean }) {
  const { open } = useAskState();
  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleAsk}
        aria-label="Ask BetriX"
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-lg text-violet transition-colors hover:bg-surface-2"
      >
        <Icon />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggleAsk}
      aria-expanded={open}
      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
        open
          ? "border-violet/60 bg-violet/15 text-violet"
          : "border-violet/35 text-violet hover:border-violet/60 hover:bg-violet/10"
      }`}
    >
      <Icon />
      Ask Betri<span className="-ml-2 text-brand">X</span>
    </button>
  );
}
