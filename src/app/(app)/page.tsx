import { Hero } from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import { Faq, Features, FinalCta, HowItWorks, Leagues, Pricing } from "@/components/landing/sections";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { MatchCard } from "@/components/match/match-card";
import { SectionHeading, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { Container, containerClass } from "@/components/ui/container";
import { liveFeed, upcomingFeed, predictBatch, bestBetOfDay, featuredFeed } from "@/lib/service";
import { FeaturedBoard } from "@/components/landing/featured-board";
import { toFeaturedRow } from "@/lib/featured";
import { matchPath, sportPath } from "@/lib/routes";

/*
 * Revalidate every minute. The landing page shows real live scores, so it
 * cannot be fully static, but it also must not hammer the upstream feeds on
 * every visit — the provider cache plus this window keeps both true.
 */
export const revalidate = 60;

export default async function HomePage() {
  // Never let a provider outage take down the marketing page.
  const [live, upcoming, featured, bestBet] = await Promise.all([
    liveFeed().catch(() => null),
    upcomingFeed(3).catch(() => null),
    featuredFeed(4).catch(() => []),
    bestBetOfDay().catch(() => null),
  ]);

  const liveMatches = live?.matches ?? [];
  const upcomingMatches = upcoming?.matches ?? [];

  // The board is curated by featured.ts; the grid below it is simply the next
  // few publishable fixtures, which is a different job and reads differently.
  const rows = featured.map((f) => toFeaturedRow(f, matchPath(f.prediction.match.id)));

  const previewSource = upcomingMatches.length > 0 ? upcomingMatches : liveMatches;
  const previews = await predictBatch(previewSource.slice(0, 6), 6).catch(() => []);

  return (
    <>
      <Hero liveCount={liveMatches.length} board={<FeaturedBoard rows={rows} />} />

      <Marquee
        items={[
          "Real fixtures only",
          "Fitted on completed matches",
          "Live scores",
          "Value after the vig",
          "NPFL + CAF covered",
          "Sample size on every pick",
          "Naira pricing",
          "18+ bet responsibly",
        ]}
      />

      {bestBet?.topPick && (
        <Container className="pt-12">
          <BestBetOfDay prediction={bestBet} />
        </Container>
      )}
      <TodaysPicks previews={previews} />
      <Features />
      <HowItWorks />
      <Leagues />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}

function TodaysPicks({ previews }: { previews: Awaited<ReturnType<typeof predictBatch>> }) {
  const usable = previews.filter((p) => p.sufficiency.publishable).slice(0, 6);

  return (
    <section className={`${containerClass()} py-20 lg:py-24`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow="Live from the model"
          title="What the numbers say right now"
          description="Pulled from the current slate the moment you loaded this page."
        />
        <ButtonLink href={sportPath("predictions")} variant="secondary" className="shrink-0">
          See all predictions
        </ButtonLink>
      </div>

      {usable.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="⚽"
            title="No fixtures with enough history right now"
            description="Predictions appear here whenever the feeds carry upcoming matches in a competition with enough completed results behind it. Nothing is fabricated to fill the space."
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">Browse all fixtures</ButtonLink>}
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {usable.map((p) => (
            <MatchCard key={p.match.id} match={p.match} prediction={p} />
          ))}
        </div>
      )}
    </section>
  );
}
