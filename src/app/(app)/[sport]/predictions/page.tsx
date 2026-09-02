import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { PredictionCard } from "@/components/match/prediction-card";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { predictBatch, upcomingFeed, bestBetOfDay } from "@/lib/service";
import { leagueByCode } from "@/lib/leagues";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Today's Football Predictions",
  description:
    "Football predictions fitted on real completed matches: 1X2, over/under, BTTS and " +
    "correct score probabilities with the sample size behind every number.",
};

export const revalidate = 300;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;

  const feed = await upcomingFeed(5, def ? league : undefined).catch(() => null);
  const predictions = feed ? await predictBatch(feed.matches, 18).catch(() => []) : [];
  // Slate-wide, so only pinned on the unfiltered view — under a specific
  // league filter it could point somewhere the visitor didn't ask to see.
  const bestBet = def ? null : await bestBetOfDay().catch(() => null);

  const publishable = predictions.filter((p) => p.sufficiency.publishable);
  const withheld = predictions.filter((p) => !p.sufficiency.publishable);

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title={def ? `${def.name} predictions` : "Today's predictions"}
        description="Each fixture is modelled against its own competition's completed results. Where the history is too thin, no pick is published — that fixture is listed separately below."
      />

      <div className={`${containerClass()} space-y-6 py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter />
        </Suspense>

        {feed && <CoverageNotice coverage={feed.coverage} />}

        {bestBet?.topPick && <BestBetOfDay prediction={bestBet} />}

        {predictions.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="No fixtures to model right now"
            description="Predictions appear as soon as the feeds carry upcoming matches. Nothing is invented to fill the page."
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">Browse fixtures</ButtonLink>}
          />
        ) : (
          <>
            {publishable.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                    Modelled fixtures
                  </h2>
                  <Badge tone="brand">{publishable.length}</Badge>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {publishable.map((p) => (
                    <PredictionCard key={p.match.id} prediction={p} />
                  ))}
                </div>
              </section>
            )}

            {withheld.length > 0 && (
              <section className="pt-4">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
                    Not enough history to call
                  </h2>
                  <Badge tone="amber">{withheld.length}</Badge>
                </div>
                <p className="mb-4 max-w-2xl text-xs leading-relaxed text-ink-dim">
                  These fixtures are real and the underlying numbers are still computed, but the
                  competition does not have enough completed matches behind it to stand a
                  selection on. They are shown so you know they exist, not so you bet them.
                </p>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {withheld.map((p) => (
                    <PredictionCard key={p.match.id} prediction={p} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
