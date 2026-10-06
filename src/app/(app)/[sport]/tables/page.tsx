import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { containerClass } from "@/components/ui/container";
import { LeagueTabs } from "@/components/stats/league-tabs";
import { LeagueTable } from "@/components/stats/league-table";
import { Badge, LiveDot } from "@/components/ui/primitives";
import { leagueByCode } from "@/lib/leagues";
import { liveLeagueTable } from "@/lib/stats/live-table";
import { leagueTeams, recentResults } from "@/lib/stats/queries";
import { outcome, type Outcome } from "@/lib/stats/compute";
import { STAT_LEAGUES, pickLeague } from "@/lib/stats/leagues";
import { sportPath } from "@/lib/routes";

/** Cups have groups and knockouts, not a table we publish. */
const TABLE_LEAGUES = STAT_LEAGUES.filter((l) => l.code !== "caf-champions-league");

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ league?: string }> }): Promise<Metadata> {
  const { league } = await searchParams;
  const def = leagueByCode(pickLeague(league, TABLE_LEAGUES.map((l) => l.code)));
  return {
    title: `${def?.name ?? "League"} Table`,
    description: `The ${def?.name ?? "league"} table, updated live while games are in play, with each club's last five results.`,
    alternates: { canonical: `${sportPath("tables")}?league=${def?.code ?? ""}` },
  };
}

export const dynamic = "force-dynamic";

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ league?: string }> }) {
  const { league } = await searchParams;
  const code = pickLeague(league, TABLE_LEAGUES.map((l) => l.code));
  const def = leagueByCode(code)!;

  const [table, teams] = await Promise.all([
    liveLeagueTable(code).catch(() => null),
    leagueTeams(code).catch(() => []),
  ]);
  const recent = await recentResults(teams.map((t) => t.id), 5, code).catch(() => new Map());
  const form: Record<string, Outcome[]> = {};
  for (const [id, rs] of recent) form[id] = rs.map(outcome);

  return (
    <>
      <PageHeader
        eyebrow="League tables"
        title={`${def.name} table`}
        description="Standings that move as goals go in."
      />
      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-11" />}>
          <LeagueTabs leagues={TABLE_LEAGUES} active={code} />
        </Suspense>

        {table && table.rows.length > 0 ? (
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
              <span className="text-lg" aria-hidden>{def.flag}</span>
              <h2 className="font-display text-lg font-bold">{def.name}</h2>
              {table.season && <span className="text-xs text-ink-dim">{table.season.replace(/^(\d{4})-(\d{2})(\d{2})$/, "$1-$3")}</span>}
              <span className="ml-auto">
                {table.liveGames > 0 ? (
                  <Badge tone="live"><LiveDot /> Live · {table.liveGames} in play</Badge>
                ) : (
                  <span className="text-[11px] text-ink-dim">
                    {table.updatedAt ? `Updated ${new Date(table.updatedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" })}` : ""}
                  </span>
                )}
              </span>
            </div>
            <LeagueTable key={code} initial={table} form={form} />
          </section>
        ) : (
          <div className="card p-8 text-center text-sm text-ink-muted">No table published for {def.name} yet.</div>
        )}
      </div>
    </>
  );
}
