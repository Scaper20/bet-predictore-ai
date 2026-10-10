"use client";

import { useEffect } from "react";
import { openAsk, setAskPage } from "@/lib/ask-store";

/** Tells Ask KiqStat which match the user is looking at, for as long as this page is mounted. */
export function AskPageContext({ matchId, label }: { matchId: string; label: string }) {
  useEffect(() => {
    setAskPage({ matchId, label });
    return () => setAskPage(null);
  }, [matchId, label]);
  return null;
}

const QUESTIONS = ["Best pick for this game", "Is over 2.5 worth it?", "Compare their form"];

/** The match page's way in: one-tap questions about this fixture. */
export function AskAboutMatch({ label }: { label: string }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-violet font-display text-base font-extrabold text-canvas" aria-hidden>
          X
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Ask KiqStat about this match</h2>
          <p className="truncate text-xs text-ink-dim">{label}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => openAsk({ text: q, send: true })}
            className="rounded-full border border-violet/30 bg-violet/8 px-3 py-1.5 text-xs font-medium text-violet transition-colors hover:border-violet/60"
          >
            {q}
          </button>
        ))}
        <button
          type="button"
          onClick={() => openAsk()}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          Ask your own…
        </button>
      </div>
    </section>
  );
}
