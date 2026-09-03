import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { MatchCard } from "@/components/match/match-card";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { upcomingFeed } from "@/lib/service";
import { groupByDay } from "@/lib/format";
import { leagueByCode } from "@/lib/leagues";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Football Fixtures",
  description:
    "Upcoming football fixtures across the Premier League, NPFL, Champions League and more, " +
    "with kickoff times in West Africa Time.",
};

export const revalidate = 180;

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; days?: string }>;
}) {
  const { league, days } = await searchParams;
  const window = clamp(Number(days ?? 7), 1, 14);
  const def = league ? leagueByCode(league) : undefined;

  const feed = await upcomingFeed(window, def ? league : undefined).catch(() => null);
  const groups = groupByDay(feed?.matches ?? []);

  return (
    <>
      <PageHeader
        eyebrow="Fixtures"
        title={def ? `${def.name} fixtures` : "Upcoming fixtures"}
        description={`Kickoff times shown in West Africa Time. Looking ${window} day${window === 1 ? "" : "s"} ahead.`}
      />

      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter />
        </Suspense>

        {feed && <CoverageNotice coverage={feed.coverage} />}

        {groups.length === 0 ? (
          <EmptyState
            icon="📅"
            title={def ? `No ${def.shortName} fixtures in this window` : "No fixtures in this window"}
            description="Nothing scheduled that the configured feeds can see. Try a different league or widen the window — no placeholder fixtures are ever shown here."
            action={<ButtonLink href={`${sportPath("fixtures")}?days=14`} variant="secondary">Look 14 days ahead</ButtonLink>}
          />
        ) : (
          groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-ink-muted">
                {group.day}
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs font-normal text-ink-dim">
                  {group.matches.length} match{group.matches.length === 1 ? "" : "es"}
                </span>
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.matches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 7;
}
