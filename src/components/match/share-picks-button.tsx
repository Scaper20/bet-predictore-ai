"use client";

import { useState } from "react";
import { ShareImageSheet } from "@/components/slip/share-slip-sheet";

/** Opens the match's picks as a shareable image (api/match/[id]/share-image). */
export function SharePicksButton({ matchId, label }: { matchId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold normal-case tracking-normal text-ink-muted hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 11v5h12v-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Share
      </button>
      {open && (
        <ShareImageSheet
          src={`/api/match/${encodeURIComponent(matchId)}/share-image`}
          title="picks"
          filename="kiqstat-picks.png"
          shareText={`${label} · picks on KiqStat · kiqstat.app`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
