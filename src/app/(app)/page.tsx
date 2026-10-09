import { Hero } from "@/components/landing/hero";
import { Marquee } from "@/components/landing/marquee";
import type { Metadata } from "next";
import { Faq, FAQS, Features, FinalCta, HowItWorks, Leagues, Pricing } from "@/components/landing/sections";
import { JsonLd } from "@/components/seo/json-ld";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { MatchCard } from "@/components/match/match-card";
import { SectionHeading, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { Container, containerClass } from "@/components/ui/container";
import { liveFeed, upcomingFeed, predictBatch, bestBetOfDay, featuredFeed, freePickPredictions, freeViewer } from "@/lib/service";
import { viewPrediction } from "@/lib/access";
import { FeaturedBoard } from "@/components/landing/featured-board";
import { WhatsAppPromo } from "@/components/landing/whatsapp-promo";
import { toFeaturedRow, type FeaturedReasonCode } from "@/lib/featured";
import type { FreeSlot } from "@/lib/free-picks";
import { matchPath, sportPath } from "@/lib/routes";

/*
 * Revalidate every minute. The landing page shows real live scores, so it
 * cannot be fully static, but it also must not hammer the upstream feeds on
 * every visit — the provider cache plus this window keeps both true.
 */
export const revalidate = 60;

export const metadata: Metadata = { alternates: { canonical: "/" } };

const BOARD_SLOTS = 4;
const FINISHED = new Set(["finished", "cancelled", "postponed"]);
const SLOT_REASON: Record<FreeSlot, FeaturedReasonCode> = { strong: "free-strong", hot: "free-hot", normal: "free" };

/*
 * The FAQ as structured data. Google no longer shows FAQ rich results for
 * most sites, but answer engines (ChatGPT search, Perplexity, AI Overviews)
 * lift question/answer pairs like these almost verbatim — this is the
 * cheapest GEO win on the site, and it only restates what is visible below.
 */
const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

/** When this render ran. The page is cached, so this can be well before the visit. */
function renderTime(): number {
  return Date.now();
}

export default async function HomePage() {
  // Never let a provider outage take down the marketing page.
  const [live, upcoming, featured, rawBest, viewer, freePicks] = await Promise.all([
    liveFeed().catch(() => null),
    upcomingFeed(3).catch(() => null),
    featuredFeed(BOARD_SLOTS).catch(() => []),
    bestBetOfDay().catch(() => null),
    freeViewer(),
    freePickPredictions(),
  ]);
  // Cached and shared by every visitor, so this page always shows the free
  // view (lib/access.ts); signed-in Pro users get full picks everywhere else.
  const bestBet = rawBest ? viewPrediction(rawBest, viewer) : null;

  const liveMatches = live?.matches ?? [];
  const upcomingMatches = upcoming?.matches ?? [];

  // The board leads with today's featured set still to play (the Strong one,
  // the hot games, then the rest), topped up from featured.ts's ranking. The
  // grid below shows all six, finished ones included, so a
  // visitor can see how they did.
  const openFree = freePicks.filter(({ prediction: p }) => !FINISHED.has(p.match.status));
  const boardFree = openFree.slice(0, BOARD_SLOTS);
  const onBoard = new Set(boardFree.map((f) => f.prediction.match.id));
  const rowsFromPicks = [
    ...boardFree.map(({ prediction, slot }) =>
      toFeaturedRow({ prediction: viewPrediction(prediction, viewer), score: 1, reason: SLOT_REASON[slot] }, matchPath(prediction.match.id)),
    ),
    ...featured
      .filter((f) => !onBoard.has(f.prediction.match.id))
      .slice(0, BOARD_SLOTS - boardFree.length)
      .map((f) => toFeaturedRow({ ...f, prediction: viewPrediction(f.prediction, viewer) }, matchPath(f.prediction.match.id))),
  ];
  // The rows come from predictions cached for minutes at a time, so their
  // score and minute can be well behind; the live feed fetched above is
  // seconds old, and its timestamp is what the board's clocks count on from.
  const liveById = new Map(liveMatches.map((m) => [m.id, m]));
  const rows = rowsFromPicks.map((r) => {
    const m = liveById.get(r.id);
    return m
      ? { ...r, status: m.status, minute: m.minute ?? null, home: { ...r.home, score: m.score.home }, away: { ...r.away, score: m.score.away } }
      : r;
  });
  const boardAt = live ? Date.parse(live.updatedAt) : renderTime();

  let previews = freePicks.map(({ prediction }) => viewPrediction(prediction, viewer));
  const freeGrid = previews.length > 0;
  if (!freeGrid) {
    const previewSource = upcomingMatches.length > 0 ? upcomingMatches : liveMatches;
    previews = (await predictBatch(previewSource.slice(0, 6), 6).catch(() => [])).map((p) => viewPrediction(p, viewer));
  }

  return (
    <>
      <JsonLd data={FAQ_JSON_LD} />
      <Hero liveCount={liveMatches.length} board={<FeaturedBoard rows={rows} renderedAt={boardAt} />} />

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
      <TodaysPicks previews={previews} free={freeGrid} />
      <WhatsAppPromo />
      <Features />
      <HowItWorks />
      <Leagues />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}

function TodaysPicks({ previews, free }: { previews: Awaited<ReturnType<typeof predictBatch>>; free: boolean }) {
  const usable = previews.filter((p) => p.sufficiency.publishable).slice(0, 6);

  return (
    <section className={`${containerClass()} py-12 sm:py-20 lg:py-24`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow={free ? "Today" : "Live from the model"}
          title={free ? "Hot games and top picks" : "What the numbers say right now"}
          description={free ? "The day's Strong pick, the two games everyone is talking about and three more of the model's best reads." : undefined}
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
            description="Check back when the next fixtures are out."
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
