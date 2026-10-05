import type { ReactNode } from "react";
import { Crest } from "@/components/ui/crest";
import type { LiveGroup } from "@/lib/live-board";

/** A competition's card of rows, the Live board's look, for server-rendered lists. */
export function LeagueGroupCard({ group, aside, children }: { group: LiveGroup; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        {group.flag ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-base" aria-hidden>
            {group.flag}
          </span>
        ) : (
          <Crest src={group.logo} name={group.name} size={28} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{group.name}</span>
          {group.country && <span className="block truncate text-[11px] text-ink-dim">{group.country}</span>}
        </span>
        {aside}
        <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
          {group.matches.length}
        </span>
      </div>
      {children}
    </section>
  );
}
