"use client";

import { useState } from "react";

/** A booking code with a copy button. Loading it on SportyBet is the user's step. */
export function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the code is on screen to type in.
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/8 px-4 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-dim">SportyBet code</p>
        <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.12em] text-ink">{code}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="press rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-brand-ink hover:bg-brand-strong"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
