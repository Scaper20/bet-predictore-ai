"use client";

import { useState } from "react";
import { BookCodeButton } from "@/components/slip/book-code-button";
import type { SlipLeg } from "@/lib/slip";

/**
 * "Get SportyBet code" for one prop pick: the same booking path and weekly
 * allowance as a combo, with the pick as its only leg. Opens on tap so a
 * board of cards does not render forty booking widgets.
 */
export function PropBook({ leg }: { leg: SlipLeg }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/35 bg-brand/10 px-3 text-xs font-bold text-brand transition-colors hover:bg-brand/20"
      >
        SportyBet code <span aria-hidden>→</span>
      </button>
    );
  }
  return (
    <div className="w-full pt-1">
      <BookCodeButton legs={[leg]} />
    </div>
  );
}
