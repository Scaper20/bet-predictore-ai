"use client";

import { toggleAsk, useAskState } from "@/lib/ask-store";

const Icon = ({ small = false }: { small?: boolean }) => (
  <svg viewBox="0 0 20 20" className={small ? "size-4" : "size-[18px]"} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
  </svg>
);

/**
 * Opens the Ask KiqStat panel: the labelled pill on desktop, and the same
 * pill a size down in the phone header.
 */
export function AskButton({ size = "md" }: { size?: "md" | "sm" }) {
  const { open } = useAskState();
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={toggleAsk}
      aria-expanded={open}
      className={`flex shrink-0 items-center whitespace-nowrap border font-semibold transition-colors ${
        sm ? "h-9 gap-1.5 rounded-[10px] px-2.5 text-[13px]" : "h-10 gap-2 rounded-xl px-3.5 text-sm"
      } ${
        open
          ? "border-brand/50 bg-brand/10 text-brand"
          : "border-line-strong text-ink hover:border-brand/50 hover:bg-brand/8"
      }`}
    >
      <span className={open ? "" : "text-brand"}>
        <Icon small={sm} />
      </span>
      <span>Ask KiqStat</span>
    </button>
  );
}
