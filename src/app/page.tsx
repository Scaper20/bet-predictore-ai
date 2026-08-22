import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ChatWidget } from "@/components/support/chat-widget";
import { Hero } from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import { Faq, Features, FinalCta, HowItWorks, Leagues, Pricing } from "@/components/landing/sections";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { MatchCard } from "@/components/match/match-card";
import { SectionHeading, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { liveFeed, upcomingFeed, predictBatch, bestBetOfDay } from "@/lib/service";
import type { Match } from "@/lib/types";

/*
 * Revalidate every minute. The landing page shows real live scores, so it
 * cannot be fully static, but it also must not hammer the upstream feeds on
 * every visit — the provider cache plus this window keeps both true.
 */
export const revalidate = 60;

export default async function HomePage() {
  // Never let a provider outage take down the marketing page.
  const [live, upcoming, bestBet] = await Promise.all([
    liveFeed().catch(() => null),
    upcomingFeed(3).catch(() => null),
    bestBetOfDay().catch(() => null),
  ]);

  const liveMatches = live?.matches ?? [];
  const upcomingMatches = upcoming?.matches ?? [];

  // The hero board prefers live games, then falls back to what is next up.
  const featured: Match[] = (liveMatches.length > 0 ? liveMatches : upcomingMatches).slice(0, 4);

  const previewSource = upcomingMatches.length > 0 ? upcomingMatches : liveMatches;

  // The hero board and the picks grid can show different fixtures, so both
  // sets are predicted together and then read back by id.
  const predictionTargets = dedupeById([...featured, ...previewSource.slice(0, 6)]);
  const predictions = await predictBatch(predictionTargets, predictionTargets.length).catch(() => []);
  const byId = new Map(predictions.map((p) => [p.match.id, p]));

  const previews = previewSource
    .map((m) => byId.get(m.id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  const heroProbabilities = featured.map((m) => {
    const p = byId.get(m.id);
    return p
      ? { home: p.markets.home, draw: p.markets.draw, away: p.markets.away }
      : { home: 0, draw: 0, away: 0 };
  });

  return (
    <>
      <SiteHeader />
      <main>
        <Hero
          liveCount={liveMatches.length}
          featured={featured}
          featuredProbabilities={
            heroProbabilities.some((p) => p.home > 0) ? heroProbabilities : undefined
          }
        />

        <Marquee
          items={[
            "Real fixtures only",
            "Dixon-Coles goal model",
            "Live scores",
            "Value after the vig",
            "NPFL + CAF covered",
            "Sample size on every pick",
            "Naira pricing",
            "18+ bet responsibly",
          ]}
        />

        {bestBet?.topPick && (
          <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
            <BestBetOfDay prediction={bestBet} />
          </div>
        )}
        <TodaysPicks previews={previews} />
        <Features />
        <HowItWorks />
        <Leagues />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <ChatWidget />
    </>
  );
}

function dedupeById(matches: Match[]): Match[] {
  const seen = new Map<string, Match>();
  for (const m of matches) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()];
}

function TodaysPicks({ previews }: { previews: Awaited<ReturnType<typeof predictBatch>> }) {
  const usable = previews.filter((p) => p.sufficiency.publishable).slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow="Live from the model"
          title="What the numbers say right now"
          description="Pulled from the current slate the moment you loaded this page."
        />
        <ButtonLink href="/predictions" variant="secondary" className="shrink-0">
          See all predictions
        </ButtonLink>
      </div>

      {usable.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon="⚽"
            title="No fixtures with enough history right now"
            description="Predictions appear here whenever the feeds carry upcoming matches in a competition with enough completed results behind it. Nothing is fabricated to fill the space."
            action={<ButtonLink href="/fixtures" variant="secondary">Browse all fixtures</ButtonLink>}
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {usable.map((p) => (
            <MatchCard key={p.match.id} match={p.match} prediction={p} />
          ))}
        </div>
      )}
    </section>
  );
}
