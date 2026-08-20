import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { PredictionCard } from "@/components/match/prediction-card";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { leagueByCode } from "@/lib/leagues";

export const metadata: Metadata = {
  title: "AI Football Predictions",
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

  const publishable = predictions.filter((p) => p.sufficiency.publishable);
  const withheld = predictions.filter((p) => !p.sufficiency.publishable);

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title={def ? `${def.name} predictions` : "Today's predictions"}
        description="Each fixture is modelled against its own competition's completed results. Where the history is too thin, no pick is published — that fixture is listed separately below."
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter />
        </Suspense>

        {feed && <CoverageNotice coverage={feed.coverage} />}

        {predictions.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="No fixtures to model right now"
            description="Predictions appear as soon as the feeds carry upcoming matches. Nothing is invented to fill the page."
            action={<ButtonLink href="/fixtures" variant="secondary">Browse fixtures</ButtonLink>}
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
