import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { LiveBoard } from "@/components/match/live-board";
import { CoverageNotice } from "@/components/ui/coverage-notice";
import { UrlTabs } from "@/components/motion/url-tabs";
import { FixturesView } from "@/components/scores/fixtures-view";
import { ResultsView } from "@/components/scores/results-view";
import { liveFeed } from "@/lib/service";
import { isLive } from "@/lib/format";
import { leagueByCode } from "@/lib/leagues";
import { containerClass } from "@/components/ui/container";
import { SCORES_VIEWS, scoresPath, type ScoresView } from "@/lib/routes";

/**
 * Scores: live, fixtures and results on one page.
 *
 * They were three pages until October 2026, and most visits moved between
 * them looking for one game: is it on, when is it, how did it end. The view
 * sits in the query (?view=fixtures|results); /fixtures and /results redirect
 * here with their own query intact (next.config.ts).
 */

type Params = { view?: string; league?: string; day?: string; days?: string };

const TITLES: Record<ScoresView, { title: string; description: string; meta: string }> = {
  live: {
    title: "Live scores",
    description: "Every match in play, updating live.",
    meta: "Live football scores across the Premier League, NPFL, CAF competitions and more, updated continuously from real data feeds.",
  },
  fixtures: {
    title: "Fixtures",
    description: "Times in your time zone. Tap a game for our read.",
    meta: "Upcoming football fixtures across the Premier League, NPFL, AFCON, Champions League and more, with kickoff times in your own time zone.",
  },
  results: {
    title: "Results",
    description: "Final scores and how our picks did.",
    meta: "Final scores from every competition KiqStat covers, day by day, with how each of our picks did.",
  },
};

function asView(v: string | undefined): ScoresView | null {
  return SCORES_VIEWS.includes(v as ScoresView) ? (v as ScoresView) : null;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const { view: raw, league } = await searchParams;
  const view = asView(raw) ?? "live";
  const def = league ? leagueByCode(league) : undefined;
  const t = TITLES[view];
  return {
    title: def && view !== "live" ? `${def.name} ${t.title}` : view === "live" ? "Live Football Scores" : `Football ${t.title}`,
    description: def && view !== "live" ? `${def.name} ${t.title.toLowerCase()}. ${t.meta}` : t.meta,
    alternates: { canonical: scoresPath(view, { league: view === "live" ? undefined : def?.code }) },
  };
}

/** Scores move constantly; nothing here is worth caching. */
export const dynamic = "force-dynamic";

export default async function ScoresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const def = params.league ? leagueByCode(params.league) : undefined;
  const feed = await liveFeed().catch(() => null);
  const liveCount = feed?.matches.filter(isLive).length ?? 0;
  // With no view asked for: live when something is on, otherwise what's next.
  const view = asView(params.view) ?? (liveCount > 0 ? "live" : "fixtures");
  const t = TITLES[view];

  const tabs = SCORES_VIEWS.map((v) => ({
    key: v,
    href: scoresPath(v, { league: v === "live" ? undefined : def?.code }),
    label:
      v === "live" ? (
        <span className="flex items-center gap-1.5">
          Live
          {liveCount > 0 && (
            <span className="tnum rounded-full bg-signal px-1.5 font-mono text-[10px] font-bold leading-4 text-canvas">
              {liveCount}
            </span>
          )}
        </span>
      ) : (
        TITLES[v].title
      ),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Scores"
        title={def && view !== "live" ? `${def.name} ${t.title.toLowerCase()}` : t.title}
        description={t.description}
      />
      <div className={`${containerClass()} space-y-6 py-6 sm:py-8`}>
        <UrlTabs ariaLabel="Scores" value={view} tabs={tabs} className="max-w-md" />

        {view === "live" &&
          (feed ? (
            <>
              <CoverageNotice coverage={feed.coverage} />
              <LiveBoard initial={feed.matches} initialAt={Date.parse(feed.updatedAt)} />
            </>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-sm text-ink-muted">The live feed is not responding right now. Refresh in a moment.</p>
            </div>
          ))}
        {view === "fixtures" && <FixturesView def={def} days={params.days} />}
        {view === "results" && <ResultsView def={def} day={params.day} />}
      </div>
    </>
  );
}
