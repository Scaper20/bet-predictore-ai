import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FixturesBoard } from "@/components/match/fixtures-board";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { upcomingFeed } from "@/lib/service";
import { leagueByCode } from "@/lib/leagues";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

/** Per-league titles and canonicals; see predictions/page.tsx for why. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}): Promise<Metadata> {
  const { league } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;
  const base = sportPath("fixtures");
  if (!def) {
    return {
      title: "Football Fixtures",
      description:
        "Upcoming football fixtures across the Premier League, NPFL, AFCON, Champions League " +
        "and more, with kickoff times in your own time zone.",
      alternates: { canonical: base },
    };
  }
  return {
    title: `${def.name} Fixtures`,
    description: `Upcoming ${def.name} fixtures with kickoff times in your own time zone and a model prediction for every match.`,
    alternates: { canonical: `${base}?league=${def.code}` },
  };
}

export const revalidate = 180;

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; days?: string }>;
}) {
  const { league, days } = await searchParams;
  const window = clamp(Number(days ?? 14), 1, 14);
  const def = league ? leagueByCode(league) : undefined;

  const feed = await upcomingFeed(window, def ? league : undefined).catch(() => null);
  const matches = feed?.matches ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Fixtures"
        title={def ? `${def.name} fixtures` : "Fixtures"}
        description="Times in your time zone. Tap a game for our read."
      />

      <div className={`${containerClass()} space-y-6 py-7 sm:py-10`}>
        {feed && <CoverageNotice coverage={feed.coverage} />}

        {matches.length === 0 ? (
          <EmptyState
            icon="📅"
            title={def ? `No ${def.shortName} fixtures in the next ${window} days` : "No fixtures in this window"}
            description="Try another competition."
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">All competitions</ButtonLink>}
          />
        ) : (
          <Suspense fallback={<div className="card h-64 skeleton" />}>
            <FixturesBoard matches={matches} league={def?.code} windowDays={window} />
          </Suspense>
        )}
      </div>
    </>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 14;
}
