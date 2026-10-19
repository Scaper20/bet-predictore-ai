import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { LeagueFilter } from "@/components/match/league-filter";
import { ProLeaguesBanner } from "@/components/entitlements/pro-league-lock";
import { isProLeague } from "@/lib/pro-leagues";
import { PickRow } from "@/components/match/pick-row";
import { riskFor, type RiskLevel } from "@/lib/model/risk";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { Badge, ButtonLink, EmptyState } from "@/components/ui/primitives";
import { BestBetOfDay } from "@/components/landing/best-bet-of-day";
import { predictBatch, upcomingFeed, bestBetOfDay } from "@/lib/service";
import { getPreferences } from "@/lib/preferences";
import { leagueByCode } from "@/lib/leagues";
import { FixtureRow } from "@/components/match/fixture-row";
import { containerClass } from "@/components/ui/container";
import { sportPath, scoresPath } from "@/lib/routes";
import { isStrong } from "@/lib/model/tiers";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { viewPrediction } from "@/lib/access";
import { pickSections } from "@/lib/pick-sections";
import { LiveScoresProvider } from "@/components/match/pick-action";
import { LiveDot } from "@/components/ui/primitives";

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
        "Football predictions fitted on real completed matches: match result, over/under, both teams to score and " +
        "correct score probabilities with the sample size behind every number.",
      alternates: { canonical: base },
    };
  }
  return {
    title: `${def.name} Predictions Today`,
    description:
      `${def.name} predictions from a statistical model fitted on real results: win, draw, ` +
      `over/under 2.5, both teams to score and correct score probabilities, with the sample size behind each.`,
    alternates: { canonical: `${base}?league=${def.code}` },
  };
}

export const revalidate = 300;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; tier?: string; risk?: string; sort?: string }>;
}) {
  const { league, tier, risk: riskParam, sort } = await searchParams;
  const strongOnly = tier === "strong";
  const risk = (["low", "medium", "high"] as RiskLevel[]).find((r) => r === riskParam);
  const byChance = sort === "chance";
  const def = league ? leagueByCode(league) : undefined;

  // Every game with a prediction in the next two weeks, not just the first
  // few: the list rows are light enough to show a whole fortnight.
  const feed = await upcomingFeed(WINDOW_DAYS, def ? league : undefined).catch(() => null);
  const [rawPredictions, rawBest, viewer] = await Promise.all([
    feed ? predictBatch(feed.matches, MAX_GAMES).catch(() => []) : Promise.resolve([]),
    // Slate-wide, so only pinned on the unfiltered view — under a specific
    // league filter it could point somewhere the visitor didn't ask to see.
    def ? Promise.resolve(null) : bestBetOfDay().catch(() => null),
    getViewer(),
  ]);
  // Locked picks and markets are stripped here, on the server, for a free
  // viewer (lib/access.ts): every match still shows.
  const predictions = rawPredictions.map((p) => viewPrediction(p, viewer));
  const bestBet = rawBest ? viewPrediction(rawBest, viewer) : null;
  const proHeld = predictions.filter((p) => p.locked.proLeague).length;

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
  const followed = new Set(def ? [] : preferences.leagues);

  const publishable = predictions.filter(
    (p) =>
      p.sufficiency.publishable &&
      p.topPick &&
      (!strongOnly || isStrong(p.topPick, p.match.league.code)) &&
      // A locked pick's chance never reaches the page, so it has no risk to filter on.
      (!risk || (!p.locked.pick && riskFor(p.topPick.probability) === risk)),
  );
  // Games per competition, for the league filter. Only on the unfiltered
  // view, where the feed holds every competition.
  const counts: Record<string, number> | undefined = def
    ? undefined
    : predictions.reduce<Record<string, number>>((acc, p) => {
        const code = p.match.league.code;
        if (code && p.sufficiency.publishable) acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      }, {});
  const withheld = predictions.filter((p) => !p.sufficiency.publishable);

  // Live first, then the rest of today, then tomorrow and on (lib/pick-sections.ts).
  const sections = pickSections(publishable, { followed }).map((s) =>
    byChance
      ? { ...s, items: [...s.items].sort((a, b) => Number(b.locked.pick ? 0 : b.topPick!.probability) - Number(a.locked.pick ? 0 : a.topPick!.probability)) }
      : s,
  );

  return (
    <>
      <PageHeader
        eyebrow="Predictions"
        title={def ? `${def.name} picks` : "Picks"}
        description="Data insights from analysed football matches."
      />

      <div className={`${containerClass()} space-y-7 py-7 sm:py-10`}>
        <Suspense fallback={<div className="h-10" />}>
          <LeagueFilter proTags={!viewer.paid} counts={counts} />
        </Suspense>

        {!viewer.paid && def && isProLeague(def.code) ? (
          <ProLeaguesBanner league={{ code: def.code, name: def.name }} held={proHeld} />
        ) : !viewer.paid && proHeld > 0 ? (
          <ProLeaguesBanner held={proHeld} />
        ) : null}

        <PickFilters strongOnly={strongOnly} risk={risk} byChance={byChance} league={def ? league : undefined} />

        {feed && <CoverageNotice coverage={feed.coverage} />}

        <LiveScoresProvider matches={[...(bestBet ? [bestBet] : []), ...publishable].map((p) => ({ id: p.match.id, kickoff: p.match.kickoff, status: p.match.status }))}>
          {bestBet?.topPick && (!strongOnly || isStrong(bestBet.topPick, bestBet.match.league.code)) && <BestBetOfDay prediction={bestBet} />}

          {predictions.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="No fixtures to model right now"
              description="Check back when the next fixtures are out."
              action={<ButtonLink href={scoresPath("fixtures")} variant="secondary">Browse fixtures</ButtonLink>}
            />
          ) : (
            <>
              {(strongOnly || risk) && sections.length === 0 && (
                <EmptyState
                  icon={strongOnly ? "★" : "⚖"}
                  title={strongOnly ? "No Strong picks right now" : `No ${risk} risk picks right now`}
                  description={strongOnly ? "Strong picks are our most confident. Some days there are none." : "Try another risk level or all picks."}
                />
              )}
              {sections.map((section) => (
                <section key={section.key} className="scroll-reveal">
                  <div className="mb-4 flex items-center gap-3">
                    {section.live && <LiveDot />}
                    <h2 className="font-display text-xl font-bold">{section.title}</h2>
                    <Badge tone={section.live ? "rose" : "brand"}>{section.items.length}</Badge>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <div className="card overflow-hidden">
                    {section.items.map((p) => (
                      <PickRow key={p.match.id} prediction={p} />
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
        </LiveScoresProvider>
      </div>
    </>
  );
}

/** Days of fixtures the page lists, and the most games it will model at once. */
const WINDOW_DAYS = 14;
const MAX_GAMES = 900;

/**
 * Which picks and in what order: all or Strong only, one risk level, and
 * kick-off order or highest chance first. All in the URL, so a filtered view
 * can be shared and the page stays server-rendered.
 */
function PickFilters({
  strongOnly,
  risk,
  byChance,
  league,
}: {
  strongOnly: boolean;
  risk?: RiskLevel;
  byChance: boolean;
  league?: string;
}) {
  const href = (next: { strong?: boolean; risk?: RiskLevel | null; chance?: boolean }) => {
    const q = new URLSearchParams();
    if (league) q.set("league", league);
    const strong = next.strong ?? strongOnly;
    const r = next.risk === undefined ? risk : next.risk;
    const c = next.chance ?? byChance;
    if (strong) q.set("tier", "strong");
    if (r) q.set("risk", r);
    if (c) q.set("sort", "chance");
    const qs = q.toString();
    return `${sportPath("predictions")}${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
      active ? "border-brand/40 bg-brand/12 text-brand" : "border-line bg-surface text-ink-muted hover:text-ink"
    }`;
  const dot = { low: "bg-brand", medium: "bg-amber", high: "bg-rose" } as const;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Which picks" className="flex flex-wrap items-center gap-2">
        <Link href={href({ strong: false, risk: null })} className={chip(!strongOnly && !risk)} aria-current={!strongOnly && !risk ? "page" : undefined}>
          All picks
        </Link>
        <Link href={href({ strong: !strongOnly })} className={chip(strongOnly)} aria-current={strongOnly ? "page" : undefined}>
          <span className="text-amber" aria-hidden>★</span> Strong
        </Link>
        {(["low", "medium", "high"] as const).map((r) => (
          <Link key={r} href={href({ risk: risk === r ? null : r })} className={chip(risk === r)} aria-current={risk === r ? "page" : undefined}>
            <span className={`size-1.5 rounded-full ${dot[r]}`} aria-hidden />
            {r === "low" ? "Low risk" : r === "medium" ? "Medium" : "High"}
          </Link>
        ))}
      </nav>
      <nav aria-label="Order" className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
        <Link href={href({ chance: false })} className={`rounded-md px-3 py-1.5 ${!byChance ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>
          Kick-off
        </Link>
        <Link href={href({ chance: true })} className={`rounded-md px-3 py-1.5 ${byChance ? "bg-surface-3 text-ink" : "text-ink-muted hover:text-ink"}`}>
          Best chance
        </Link>
      </nav>
    </div>
  );
}
