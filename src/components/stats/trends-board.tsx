"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StreakKind } from "@/lib/stats/compute";
import type { StreakTrend } from "@/lib/stats/trends";
import { Crest } from "@/components/ui/crest";
import { SlidingTabs } from "@/components/motion/sliding-tabs";
import { LocalTime } from "@/components/ui/local-time";
import { matchPath } from "@/lib/routes";

const FILTERS: { key: string; label: string; kinds: StreakKind[] }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "wins", label: "Winning runs", kinds: ["winning", "unbeaten"] },
  { key: "goals", label: "Goals", kinds: ["over25"] },
  { key: "gg", label: "Both score", kinds: ["btts"] },
  { key: "defence", label: "Defence", kinds: ["cleanSheets", "noGoals"] },
  { key: "slumps", label: "Slumps", kinds: ["losing", "winless"] },
];

const META: Record<StreakKind, { tone: string; market: string; icon: string }> = {
  winning: { tone: "brand", market: "Win", icon: "🔥" },
  unbeaten: { tone: "brand", market: "Win or draw", icon: "🛡" },
  losing: { tone: "rose", market: "Against them", icon: "📉" },
  winless: { tone: "rose", market: "Against them", icon: "🥶" },
  over25: { tone: "amber", market: "Over 2.5", icon: "⚽" },
  btts: { tone: "cyan", market: "GG", icon: "↔" },
  cleanSheets: { tone: "violet", market: "Under / NG", icon: "🧱" },
  noGoals: { tone: "rose", market: "Under / NG", icon: "🚫" },
};

const TONE: Record<string, { text: string; bg: string; pip: string; ring: string }> = {
  brand: { text: "text-brand", bg: "bg-brand/10", pip: "bg-brand", ring: "hover:border-brand/40" },
  rose: { text: "text-rose", bg: "bg-rose/10", pip: "bg-rose", ring: "hover:border-rose/40" },
  amber: { text: "text-amber", bg: "bg-amber/10", pip: "bg-amber", ring: "hover:border-amber/40" },
  cyan: { text: "text-cyan", bg: "bg-cyan/10", pip: "bg-cyan", ring: "hover:border-cyan/40" },
  violet: { text: "text-violet", bg: "bg-violet/10", pip: "bg-violet", ring: "hover:border-violet/40" },
};

/** One plain-English sentence per streak, the way you'd say it to a friend. */
export function sentence(t: StreakTrend): string {
  const { run, of, consecutive, kind } = t.streak;
  const name = t.team.name;
  if (!consecutive) {
    if (kind === "over25") return `Over 2.5 goals in ${run} of ${name}'s last ${of} games`;
    if (kind === "btts") return `Both teams scored in ${run} of ${name}'s last ${of} games`;
  }
  switch (kind) {
    case "winning": return `${name} have won their last ${run} games`;
    case "unbeaten": return `${name} are unbeaten in ${run} games`;
    case "losing": return `${name} have lost their last ${run} games`;
    case "winless": return `${name} haven't won in ${run} games`;
    case "over25": return `Over 2.5 goals in each of ${name}'s last ${run} games`;
    case "btts": return `Both teams have scored in ${name}'s last ${run} games`;
    case "cleanSheets": return `${name} have kept ${run} clean sheets in a row`;
    case "noGoals": return `${name} haven't scored in ${run} games`;
  }
}

/**
 * Trends as streaks: a big number, one sentence, the run drawn as a row of
 * lit and unlit pips (the lit ones are the games that kept the streak
 * going), and the game coming up that makes it matter.
 */
export function TrendsBoard({ trends }: { trends: StreakTrend[] }) {
  const [filter, setFilter] = useState("all");
  const shown = useMemo(() => {
    const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
    return kinds.length ? trends.filter((t) => kinds.includes(t.streak.kind)) : trends;
  }, [trends, filter]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.kinds.length ? trends.filter((t) => f.kinds.includes(t.streak.kind)).length : trends.length])),
    [trends],
  );

  return (
    <div className="space-y-5">
      <SlidingTabs
        ariaLabel="Kind of streak"
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.filter((f) => counts[f.key] > 0 || f.key === "all").map((f) => ({ key: f.key, label: f.label, meta: counts[f.key] }))}
      />
      {shown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-muted">No streaks of this kind before the next games.</div>
      ) : (
        <div key={filter} className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t, i) => (
            <TrendCard key={t.id} t={t} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrendCard({ t, index }: { t: StreakTrend; index: number }) {
  const meta = META[t.streak.kind];
  const tone = TONE[meta.tone];
  return (
    <Link
      href={matchPath(t.fixture.id)}
      style={{ ["--i" as string]: index }}
      className={`card card-hover group flex min-w-0 flex-col p-5 ${tone.ring}`}
    >
      <div className="flex items-start gap-4">
        <div className={`grid size-16 shrink-0 place-items-center rounded-2xl ${tone.bg}`}>
          <span className={`font-mono tracking-tight text-2xl font-medium leading-none ${tone.text}`}>
            {t.streak.run}
            {!t.streak.consecutive && <span className="text-base text-ink-dim">/{t.streak.of}</span>}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Crest src={t.team.crest} name={t.team.name} size={20} />
            <span className="min-w-0 truncate text-xs font-semibold text-ink-muted">{t.team.name}</span>
            <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.bg} ${tone.text}`}>
              {meta.market}
            </span>
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{sentence(t)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1" aria-label="Most recent game on the left">
        {t.hits.map((hit, p) => (
          <span
            key={p}
            className={`pip h-2 flex-1 rounded-full ${hit ? tone.pip : "bg-surface-3"}`}
            style={{ ["--p" as string]: p, ["--i" as string]: index }}
          />
        ))}
      </div>
      <p className="mt-1 flex justify-between text-[10px] text-ink-dim">
        <span>latest</span>
        <span>earlier</span>
      </p>

      <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-3.5 text-xs">
        <span className="text-ink-dim">Next:</span>
        <span className="text-ink-dim">{t.fixture.home ? "v" : "at"}</span>
        <Crest src={t.fixture.opponentCrest} name={t.fixture.opponent} size={18} />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.fixture.opponent}</span>
        <span className="tnum shrink-0 text-ink-muted">
          <LocalTime iso={t.fixture.kickoff} kind="relative" /> <LocalTime iso={t.fixture.kickoff} />
        </span>
        <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}
