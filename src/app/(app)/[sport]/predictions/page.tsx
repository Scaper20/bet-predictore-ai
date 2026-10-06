import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { PredictionCard } from "@/components/match/prediction-card";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { predictBatch, upcomingFeed, bestBetOfDay } from "@/lib/service";
import { getPreferences } from "@/lib/preferences";
import type { Prediction } from "@/lib/model/predict";
import { leagueByCode } from "@/lib/leagues";
import { groupByDay } from "@/lib/format";
import { FixtureRow } from "@/components/match/fixture-row";
import { containerClass } from "@/components/ui/container";
import { sportPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { viewPrediction } from "@/lib/access";

/**
 * One title per league view. Without this every ?league= variant shared the
 * same title and description, so to a search engine they were duplicates of
 * the unfiltered page instead of "AFCON predictions", "NPFL predictions"...
 * An unknown league param canonicalises back to the unfiltered page.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}): Promise<Metadata> {
  const { league } = await searchParams;
  const def = league ? leagueByCode(league) : undefined;
  const base = sportPath("predictions");
  if (!def) {
    return {
      title: "Today's Football Predictions",
      description:
        "Football predictions fitted on real completed matches: 1X2, over/under, BTTS and " +
        "correct score probabilities with the sample size behind every number.",
      alternates: { canonical: base },
    };
  }
  return {
    title: `${def.name} Predictions Today`,
    description:
      `${def.name} predictions from a statistical model fitted on real results: win, draw, ` +
      `over/under 2.5, BTTS and correct score probabilities, with the sample size behind each.`,
    alternates: { canonical: `${base}?league=${def.code}` },
  };
}

export const revalidate = 300;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; tier?: string }>;
}) {
  const { league, tier } = await searchParams;
  const strongOnly = tier === "strong";
  const def = league ? leagueByCode(league) : undefined;

  const feed = await upcomingFeed(5, def ? league : undefined).catch(() => null);
  const [rawPredictions, rawBest, viewer] = await Promise.all([
    feed ? predictBatch(feed.matches, 18).catch(() => []) : Promise.resolve([]),
    // Slate-wide, so only pinned on the unfiltered view — under a specific
    // league filter it could point somewhere the visitor didn't ask to see.
    def ? Promise.resolve(null) : bestBetOfDay().catch(() => null),
    getViewer(),
  ]);
  // Locked picks and markets are stripped here, on the server, for a free
  // viewer (lib/access.ts): every match still shows.
  const predictions = rawPredictions.map((p) => viewPrediction(p, viewer));
  const bestBet = rawBest ? viewPrediction(rawBest, viewer) : null;

  /*
   * Followed competitions float to the top of the unfiltered view.
   *
   * This is what makes the onboarding questionnaire honest: the leagues
   * someone picked at sign-up have to visibly change what they see, or they
   * learn the questions were theatre. Deliberately a re-ordering, not a
   * filter — hiding everything else would make the page feel broken and
   * strand a user whose leagues have nothing on today.
   *
   * getPreferences() reads cookies, which pins this route to dynamic
   * rendering, so the `revalidate` above has no effect here and what keeps
   * the rate-limited feeds safe is the in-memory provider cache. That's an
   * accepted cost on this page only — in a shared layout it would make every
   * page dynamic, which is what the comment in (app)/layout.tsx is about.
   */
  const preferences = await getPreferences();
  const followed = new Set(preferences.leagues);
  const byFollowed = (a: Prediction, b: Prediction) => {
    const rank = (p: Prediction) => (followed.has(p.match.league.code ?? "") ? 0 : 1);
    return rank(a) - rank(b);
  };

  const publishable = predictions
    .filter((p) => p.sufficiency.publishable && (!strongOnly || isStrong(p.topPick)))
    .sort(def ? undefined : byFollowed);
  const withheld = predictions.filter((p) => !p.sufficiency.publishable);

  const days = groupByDay(publishable.map((p) => p.match)).map((g) => ({
    day: g.day,
    predictions: g.matches.map((m) => publishable.find((p) => p.match.id === m.id)!).sort(def ? undefined : byFollowed),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title={def ? `${def.name} predictions` : "Predictions"}
        description="Every game we can rate in the next few days."
      />

      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter />
        </Suspense>

        <TierToggle strongOnly={strongOnly} league={def ? league : undefined} />

        {feed && <CoverageNotice coverage={feed.coverage} />}

        {bestBet?.topPick && (!strongOnly || isStrong(bestBet.topPick)) && <BestBetOfDay prediction={bestBet} />}

        {predictions.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="No fixtures to model right now"
            description="Check back when the next fixtures are out."
            action={<ButtonLink href={sportPath("fixtures")} variant="secondary">Browse fixtures</ButtonLink>}
          />
        ) : (
          <>
            {strongOnly && days.length === 0 && (
              <EmptyState icon="★" title="No Strong picks right now" description="Strong picks are our most confident. Some days there are none." />
            )}
            {days.map((d) => (
              <section key={d.day} className="scroll-reveal">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="font-display text-xl font-bold">{d.day}</h2>
                  <Badge tone="brand">{d.predictions.length}</Badge>
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="stagger grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                  {d.predictions.map((p, i) => (
                    <div key={p.match.id} className="min-w-0" style={{ ["--i" as string]: i }}>
                      <PredictionCard prediction={p} morph={p.match.id !== bestBet?.match.id} />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {!strongOnly && withheld.length > 0 && (
              <details className="card group overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5">
                  <Badge tone="amber">{withheld.length}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">Not enough history to call</span>
                    <span className="block text-xs text-ink-dim">Real fixtures in competitions too new to the model to stand a pick on.</span>
                  </span>
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-dim transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {withheld.map((p) => (
                    <li key={p.match.id}>
                      <FixtureRow match={p.match} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** All picks, or only the Strong ones (confidence 60+, src/lib/model/tiers.ts). */
function TierToggle({ strongOnly, league }: { strongOnly: boolean; league?: string }) {
  const href = (strong: boolean) => {
    const q = new URLSearchParams();
    if (league) q.set("league", league);
    if (strong) q.set("tier", "strong");
    const qs = q.toString();
    return `${sportPath("predictions")}${qs ? `?${qs}` : ""}`;
  };
  const tab = (active: boolean) =>
    `rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`;
  return (
    <nav aria-label="Which picks" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      <Link href={href(false)} className={tab(!strongOnly)} aria-current={!strongOnly ? "page" : undefined}>
        All picks
      </Link>
      <Link href={href(true)} className={tab(strongOnly)} aria-current={strongOnly ? "page" : undefined}>
        <span className="text-amber" aria-hidden>★</span> Strong picks
      </Link>
    </nav>
  );
}
