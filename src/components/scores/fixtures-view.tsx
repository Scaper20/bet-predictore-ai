import { Suspense } from "react";
import { FixturesBoard } from "@/components/match/fixtures-board";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";
import { upcomingFeed } from "@/lib/service";
import type { LeagueDef } from "@/lib/leagues";
import { scoresPath } from "@/lib/routes";

/** The scores page's Fixtures view: the next two weeks, day by day. */
export async function FixturesView({ def, days }: { def?: LeagueDef; days?: string }) {
  const window = clamp(Number(days ?? 14), 1, 14);
  const feed = await upcomingFeed(window, def?.code).catch(() => null);
  const matches = feed?.matches ?? [];

  return (
    <>
      {feed && <CoverageNotice coverage={feed.coverage} />}
      {matches.length === 0 ? (
        <EmptyState
          icon="📅"
          title={def ? `No ${def.shortName} fixtures in the next ${window} days` : "No fixtures in this window"}
          description="Try another competition."
          action={<ButtonLink href={scoresPath("fixtures")} variant="secondary">All competitions</ButtonLink>}
        />
      ) : (
        <Suspense fallback={<div className="card h-64 skeleton" />}>
          <FixturesBoard matches={matches} league={def?.code} windowDays={window} />
        </Suspense>
      )}
    </>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 14;
}
