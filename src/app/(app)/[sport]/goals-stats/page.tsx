import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { LeagueTabs } from "@/components/stats/league-tabs";
import { GoalsTable } from "@/components/stats/goals-table";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { leagueByCode } from "@/lib/leagues";
import { leagueTeams, recentResults, type TeamRef } from "@/lib/stats/queries";
import { goalProfile, type TeamResult } from "@/lib/stats/compute";
import { STAT_LEAGUES, pickLeague } from "@/lib/stats/leagues";
import { sportPath } from "@/lib/routes";

const WINDOW = 10;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const { league } = await searchParams;
  const def = leagueByCode(pickLeague(league));
  return {
    title: `${def?.name ?? "League"} Goals Stats: Over/Under and GG`,
    description: `Over 1.5, 2.5 and 3.5, both teams to score, clean sheets and goals per game for every ${def?.name ?? ""} club.`,
    alternates: { canonical: `${sportPath("goals")}?league=${def?.code ?? ""}` },
  };
}

export const revalidate = 600;

export default async function GoalsStatsPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const code = pickLeague(league);
  const def = leagueByCode(code)!;

  const teams = await leagueTeams(code).catch(() => [] as TeamRef[]);
  const recent = await recentResults(teams.map((t) => t.id), WINDOW, code).catch(() => new Map<string, TeamResult[]>());

  const rows = teams
    .map((t) => ({ id: t.id, name: t.name, crest: t.crest, g: goalProfile(recent.get(t.id) ?? []) }))
    .filter((r) => r.g.played > 0);

  // League averages over the distinct games in the window (each game appears
  // once per club in it, so dedupe on the match before averaging).
  const games = new Map<string, TeamResult>();
  for (const rs of recent.values()) for (const r of rs) games.set(r.matchId, r);
  const league_ = goalProfile([...games.values()]);

  return (
    <>
      <PageHeader
        eyebrow="Goals stats"
        title={`${def.name} goals`}
        description={`Goal rates over the last ${WINDOW} league games.`}
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-11" />}>
          <LeagueTabs leagues={STAT_LEAGUES} active={code} />
        </Suspense>

        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-muted">No finished {def.shortName} games in our data yet.</div>
        ) : (
          <>
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Avg i={0} label="Goals per game" value={league_.totalGoals} decimals={2} />
              <Avg i={1} label="Over 2.5" value={league_.over25 * 100} suffix="%" />
              <Avg i={2} label="Both teams scored" value={league_.btts * 100} suffix="%" />
              <Avg i={3} label="Over 1.5" value={league_.over15 * 100} suffix="%" />
            </div>
            <p className="-mt-2 text-xs text-ink-dim">League averages across {games.size} recent games.</p>
            <section className="card overflow-hidden">
              <GoalsTable rows={rows} />
            </section>
          </>
        )}
      </div>
    </>
  );
}

function Avg({ label, value, suffix = "", decimals = 0, i }: { label: string; value: number; suffix?: string; decimals?: number; i: number }) {
  return (
    <div style={{ ["--i" as string]: i }} className="card p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-dim">{label}</p>
      <p className="mt-1.5 font-mono tracking-tight text-2xl font-medium text-ink">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </p>
    </div>
  );
}
