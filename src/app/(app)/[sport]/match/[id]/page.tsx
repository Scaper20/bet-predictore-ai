import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { matchPath, sportPath, scoresPath } from "@/lib/routes";
import { BttsPanel, CorrectScorePanel, DoubleChancePanel, GoalsPanel, H2HPanel, OutcomePanel } from "@/components/match/market-panels";
import { AddToSlip } from "@/components/match/add-to-slip";
import { MatchTabs, type MatchTab } from "@/components/match/match-tabs";
import { MatchStats } from "@/components/match/match-stats";
import { LeagueTable } from "@/components/stats/league-table";
import { SplitBar } from "@/components/stats/split-bar";
import { FormPips } from "@/components/stats/form-pips";
import { Morph, morphName } from "@/components/motion/morph";
import { matchContext, type MatchContext } from "@/lib/stats/match-context";
import type { Outcome } from "@/lib/stats/compute";
import { AskAboutMatch, AskPageContext } from "@/components/ask/ask-page-context";
import { TopPicks } from "@/components/match/top-picks";
import { MorePredictions } from "@/components/match/more-predictions";
import { ChipTabs, type ChipTab } from "@/components/ui/chip-tabs";
import type { StatMarkets } from "@/lib/model/match-stats";
import { LiveWinProbabilityPanel } from "@/components/match/live-win-probability-panel";
import { LiveMatchProvider, LiveProgress, LiveScore, LiveStatusBadge } from "@/components/match/live-scoreboard";
import { Gate } from "@/components/entitlements/gate";
import { DepthGate } from "@/components/entitlements/depth-gate";
import { JsonLd } from "@/components/seo/json-ld";
import { matchJsonLd } from "@/lib/seo/match-jsonld";
import { fixtureStatMarkets, teamStatAverages, type FixtureStatMarkets } from "@/lib/stat-markets-service";
import { espnCountsFor } from "@/lib/stat-results";
import { GoalExtrasPanel, StatPanel } from "@/components/match/stat-panels";
import { SportyBetLinesPanel, SportyBetLinesSkeleton } from "@/components/match/sportybet-lines";
import { matchDetail } from "@/lib/service";
import { getViewer } from "@/lib/viewer";
import { isProLeague } from "@/lib/pro-leagues";
import { ProLeagueAfterKickoff, ProLeagueMarketsLock, ProLeaguePickLock, ProStatsLock } from "@/components/entitlements/pro-league-lock";
import { viewPrediction, type ViewedPrediction } from "@/lib/access";
import { MatchAccessProvider, ProMarkets } from "@/components/match/match-access";
import { SITE_URL as SITE } from "@/lib/site-url";
import { percent, isLive } from "@/lib/format";
import { LocalTime } from "@/components/ui/local-time";
import type { Match } from "@/lib/types";
import { containerClass } from "@/components/ui/container";

/** What the scoreboard starts from, stamped with when this render read it: the
 * cached page can be served minutes later, and the clock counts on from here. */
function liveSnapshot(match: Match) {
  return {
    status: match.status,
    minute: match.minute ?? null,
    home: match.score.home,
    away: match.score.away,
    observedAt: Date.now(),
  };
}

/*
 * Rendered per request, not cached as ISR. Each match page gets few visits,
 * so a cached copy was almost never reused (about 1% of requests were cache
 * hits), yet every regeneration wrote ~90 KB to the ISR store: those writes
 * were the largest line on the Vercel bill. The data underneath is already
 * cached in memory (matchDetail, training rows, stored analyses), and the
 * live score updates on the client, so rendering on demand costs less.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) return { title: "Match not found" };

  const { match, prediction } = detail;
  // "<home> vs <away> prediction" is the exact phrase people search; the
  // competition after it disambiguates league and cup meetings of the same pair.
  const title = `${match.home.name} vs ${match.away.name} Prediction — ${match.league.name}`;
  return {
    title,
    description:
      `Model probabilities for ${match.home.name} vs ${match.away.name} in the ${match.league.name}: ` +
      `${percent(prediction.markets.home)} home, ${percent(prediction.markets.draw)} draw, ` +
      `${percent(prediction.markets.away)} away, plus over/under, BTTS (GG/NG), double chance and correct score.`,
    alternates: { canonical: matchPath(match.id) },
    openGraph: { title, type: "article" },
  };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) notFound();

  const { match } = detail;
  // Rendered per request (force-dynamic) with the viewer's own view
  // (lib/access.ts): a Pro-league match before kick-off reaches a free
  // viewer as the 1X2 split only. MatchAccessProvider still fetches the Pro
  // extras (half-time, Asian handicap) after its own plan check.
  const viewer = await getViewer();
  const prediction = viewPrediction(detail.prediction, viewer);
  const proLocked = Boolean(prediction.locked.proLeague);
  const proLeagueOpened = !viewer.paid && !proLocked && isProLeague(match.league.code);
  const started = match.status === "live" || match.status === "halftime" || match.status === "finished";
  const [ctx, extra, counts, averages] = await Promise.all([
    matchContext(match).catch((): MatchContext => ({ teamIds: { home: null, away: null }, home: null, away: null, table: null })),
    // Corners, cards, shots and more goal markets; the referee where one is
    // named (the English divisions, about a week ahead). Pro only: not even
    // computed for a free viewer, so none of it can reach their page.
    viewer.paid ? fixtureStatMarkets(match, detail.prediction).catch(() => null) : Promise.resolve(null),
    // The game's own corners and shots (ESPN) once it is on, and both clubs'
    // per-game averages: facts, so open to every viewer.
    started ? espnCountsFor(match).catch(() => null) : Promise.resolve(null),
    teamStatAverages(match).catch(() => null),
  ]);
  const referee = extra?.referee ?? null;
  const live = isLive(match);
  const label = `${match.home.name} v ${match.away.name}`;

  const tabs: MatchTab[] = [
    { key: "overview", label: "Overview", panel: <Overview match={match} prediction={prediction} ctx={ctx} live={live} label={label} proLeagueOpened={proLeagueOpened} corners={proLocked ? null : extra?.stats.corners} /> },
    { key: "markets", label: "Predictions", short: "Picks", panel: <Markets prediction={prediction} extra={proLocked ? null : extra} statsLocked={!viewer.paid} /> },
    { key: "stats", label: "Stats", panel: <MatchStats match={match} home={ctx.home} away={ctx.away} counts={counts} averages={averages} /> },
    ...(ctx.table
      ? [{
          key: "table",
          label: "Table",
          panel: (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">{match.league.name}</h2>
                <Link href={`${sportPath("tables")}?league=${match.league.code}`} className="text-xs font-medium text-brand hover:underline">
                  Full table →
                </Link>
              </div>
              <LeagueTable initial={ctx.table} highlight={[ctx.teamIds.home, ctx.teamIds.away].filter((x): x is string => Boolean(x))} compact />
            </section>
          ),
        }]
      : []),
    {
      key: "h2h",
      label: "Head-to-head",
      short: "H2H",
      panel: (
        <div className="space-y-4">
          <H2HPanel prediction={prediction} />
          {ctx.teamIds.home && ctx.teamIds.away && (
            <ButtonLink href={`${sportPath("h2h")}?a=${ctx.teamIds.home}&b=${ctx.teamIds.away}`} variant="secondary" className="w-full justify-center py-3 text-sm">
              Every meeting between these two →
            </ButtonLink>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <JsonLd data={matchJsonLd(match, prediction.markets, SITE)} />
      <AskPageContext matchId={match.id} label={label} />

      {/* ------------------------------------------------------ Scoreboard */}
      <h1 className="sr-only">
        {match.home.name} vs {match.away.name} prediction, {match.league.name}
      </h1>
      <LiveMatchProvider matchId={match.id} initial={liveSnapshot(match)}>
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_70%)]" />
        <div className={`${containerClass()} relative py-5 sm:py-8`}>
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2.5">
              {match.league.logo && <Crest src={match.league.logo} name={match.league.name} size={18} />}
              <Link href={scoresPath("fixtures", { league: match.league.code ?? "" })} className="min-w-0 truncate text-xs font-medium text-ink-muted hover:text-ink sm:text-sm">
                {match.league.name}
                {match.round && <span className="text-ink-dim"> · {match.round}</span>}
              </Link>
              <span className="ml-auto shrink-0">
                {live ? (
                  <LiveStatusBadge />
                ) : match.status === "finished" ? (
                  <Badge tone="neutral">Full time</Badge>
                ) : match.status === "postponed" ? (
                  <Badge tone="amber">Postponed</Badge>
                ) : (
                  <Badge tone="neutral"><LocalTime iso={match.kickoff} kind="relative" /></Badge>
                )}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:mt-7 sm:gap-8">
              <TeamBlock team={match.home} matchId={match.id} side="home" />
              <div className="pt-2.5 text-center sm:pt-0">
                {live ? (
                  <LiveScore className="tnum font-mono tracking-tighter text-3xl font-medium leading-none sm:text-5xl" />
                ) : match.status === "finished" ? (
                  <p className="tnum font-mono tracking-tighter text-3xl font-medium leading-none sm:text-5xl">
                    {match.score.home ?? 0}
                    <span className="mx-1.5 text-ink-dim sm:mx-3">-</span>
                    {match.score.away ?? 0}
                  </p>
                ) : (
                  <p className="tnum font-mono tracking-tighter text-2xl font-medium leading-none sm:text-4xl"><LocalTime iso={match.kickoff} /></p>
                )}
                {live ? (
                  <LiveProgress />
                ) : (
                  <p className="mt-2 text-[11px] text-ink-dim sm:text-xs">
                    <LocalTime iso={match.kickoff} kind="day" />
                  </p>
                )}
              </div>
              <TeamBlock team={match.away} matchId={match.id} side="away" />
            </div>

            <div className="mx-auto mt-6 max-w-xl sm:mt-8">
              <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                <span>Model&apos;s read</span>
                {(match.venue || referee) && (
                  <span className="truncate pl-3 normal-case tracking-normal">
                    {[match.venue, referee && `Referee: ${referee}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <SplitBar home={prediction.markets.home} draw={prediction.markets.draw} away={prediction.markets.away} size="lg" />
            </div>
          </div>
        </div>
      </header>
      </LiveMatchProvider>

      {/* ------------------------------------------------------------ Tabs */}
      <div className={`${containerClass()} pb-10 sm:pb-14`}>
        <div className="mx-auto max-w-5xl">
          <MatchAccessProvider matchId={match.id}>
            <MatchTabs tabs={tabs} />
          </MatchAccessProvider>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Overview */

function Overview({
  match,
  prediction,
  ctx,
  live,
  label,
  proLeagueOpened,
  corners,
}: {
  match: Match;
  prediction: ViewedPrediction;
  ctx: MatchContext;
  live: boolean;
  proLeagueOpened: boolean;
  label: string;
  /** Pro: the corners markets, for the corners top pick. */
  corners?: StatMarkets | null;
}) {
  const pick = prediction.topPick;
  const homeForm: Outcome[] = ctx.home?.form.letters ?? prediction.form.home.entries.map((e) => e.result as Outcome);
  const awayForm: Outcome[] = ctx.away?.form.letters ?? prediction.form.away.entries.map((e) => e.result as Outcome);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-4">
        {live && (
          <Gate
            requires="vip"
            fallback={
              <div className="card flex items-center justify-between gap-3 border-brand/25 bg-brand/[0.04] px-4 py-3">
                <p className="flex min-w-0 items-center gap-2 text-xs font-semibold"><LiveDot /> <span className="truncate">Live win probability · VIP</span></p>
                <ButtonLink href="/account/billing?plan=vip" variant="ghost" className="shrink-0 px-0 py-1 text-xs">Unlock →</ButtonLink>
              </div>
            }
          >
            <LiveWinProbabilityPanel matchId={match.id} />
          </Gate>
        )}

        {prediction.locked.proLeague && prediction.sufficiency.publishable ? (
          <ProLeaguePickLock group={pick?.group} leagueCode={match.league.code} leagueName={match.league.name} />
        ) : pick && prediction.sufficiency.publishable ? (
          <TopPicks
            prediction={prediction}
            corners={corners}
            notes={
              (prediction.sufficiency.level === "limited" || prediction.marketCheck || proLeagueOpened) && (
                <div className="mt-2">
                  {prediction.sufficiency.level === "limited" && <p className="text-xs text-amber">Thin data · treat as a guide</p>}
                  {prediction.marketCheck && <MarketCheckNote check={prediction.marketCheck} />}
                  {proLeagueOpened && <ProLeagueAfterKickoff />}
                </div>
              )
            }
          />
        ) : (
          <section className="card p-5">
            <p className="text-sm font-semibold text-amber">No pick for this game</p>
            {prediction.marketCheck && prediction.sufficiency.publishable ? (
              <MarketCheckNote check={prediction.marketCheck} />
            ) : (
              <p className="mt-1 text-xs text-ink-dim">Not enough history to publish one yet.</p>
            )}
          </section>
        )}

        <OutcomePanel prediction={prediction} facts={!prediction.locked.markets} />

        {!prediction.locked.proLeague && <MorePredictions prediction={prediction} />}

        {(homeForm.length > 0 || awayForm.length > 0) && (
          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink-muted">Form</h2>
              <a href="#stats" className="text-xs font-medium text-brand hover:underline">Full stats →</a>
            </div>
            <div className="space-y-3">
              <FormLine team={match.home} letters={homeForm} />
              <FormLine team={match.away} letters={awayForm} />
            </div>
          </section>
        )}
      </div>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(var(--header-h)+4.5rem)]">
        <AddToSlip prediction={prediction} />
        <AskAboutMatch label={label} />
        <p className="px-1 text-[11px] leading-relaxed text-ink-dim">
          Model estimates, not facts. 18+, use responsibly.{" "}
          <Link href={sportPath("trackRecord")} className="text-ink-muted underline-offset-2 hover:underline">See our record</Link>
        </p>
      </aside>
    </div>
  );
}

/**
 * Why the pick isn't the model's own first choice: SportyBet rated that one
 * well below us, or doesn't offer its line on this game.
 */
function MarketCheckNote({ check }: { check: NonNullable<ViewedPrediction["marketCheck"]> }) {
  if (check.reason === "unlisted" || check.marketChance === null) {
    return (
      <p className="mt-2 text-xs leading-relaxed text-ink-dim">
        Our first lean was {check.setAside.label} at {percent(check.setAside.probability)}, but SportyBet doesn&apos;t
        offer that line on this game, so the pick is one you can load.
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-dim">
      Our first lean was {check.setAside.label} at {percent(check.setAside.probability)}, but SportyBet rates it{" "}
      {percent(check.marketChance)}. Picks the market rates that much lower have landed far less often, so we set it aside.
    </p>
  );
}

function FormLine({ team, letters }: { team: Match["home"]; letters: Outcome[] }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <Crest src={team.crest} name={team.name} size={22} />
        <span className="min-w-0 truncate text-sm font-medium">{team.name}</span>
      </span>
      {letters.length > 0 ? <FormPips letters={letters.slice(0, 5)} /> : <span className="text-xs text-ink-dim">No recent games</span>}
    </div>
  );
}

/* -------------------------------------------------------------- Markets */

function Markets({
  prediction,
  extra,
  statsLocked,
}: {
  prediction: ViewedPrediction;
  extra: FixtureStatMarkets | null;
  statsLocked: boolean;
}) {
  if (prediction.locked.proLeague) {
    return (
      <div className="space-y-5">
        <ProLeagueMarketsLock leagueCode={prediction.match.league.code} leagueName={prediction.match.league.name} />
      </div>
    );
  }
  const h = prediction.match;
  const sections: ChipTab[] = [
    { key: "goals", label: "Goals", node: <GoalsPanel prediction={prediction} /> },
    {
      key: "result",
      label: "Result & GG",
      node: (
        <div className="grid gap-3 sm:grid-cols-2">
          <DoubleChancePanel prediction={prediction} />
          <BttsPanel prediction={prediction} />
        </div>
      ),
    },
    { key: "score", label: "Correct score", node: <CorrectScorePanel prediction={prediction} /> },
    ...(extra ? [{ key: "more-goals", label: "Team goals", node: <GoalExtrasPanel goals={extra.goals} match={h} /> }] : []),
    ...(extra
      ? (["corners", "shots", "shotsOnTarget", "cards"] as const).flatMap((kind) => {
          const m = extra.stats[kind];
          return m
            ? [{ key: kind, label: STAT_LABEL[kind], node: <StatPanel kind={kind} markets={m} match={h} referee={extra.referee} /> }]
            : [];
        })
      : statsLocked
        ? [{ key: "stats", label: "Corners & shots", pro: true, node: <ProStatsLock /> }]
        : []),
    ...(!statsLocked
      ? [{
          key: "sportybet",
          label: "On SportyBet",
          node: (
            <Suspense fallback={<SportyBetLinesSkeleton />}>
              <SportyBetLinesPanel prediction={prediction} />
            </Suspense>
          ),
        }]
      : []),
    // Pro: half-time markets and Asian handicap, fetched after the plan check.
    { key: "halves", label: "Halves & handicap", pro: true, node: <ProMarkets /> },
  ];
  return (
    // Every market beyond 1X2 comes off the same scoreline distribution, so
    // depth is one decision: a free account opens it.
    <DepthGate reason="Unlock every market on this match">
      <ChipTabs sections={sections} ariaLabel="Markets" />
    </DepthGate>
  );
}

const STAT_LABEL = { corners: "Corners", shots: "Shots", shotsOnTarget: "On target", cards: "Cards" } as const;

/**
 * One side of the scoreboard: crest above the name on every screen, so a
 * long club name wraps under its badge instead of squeezing the score.
 * The crest morphs in from the row the visitor tapped.
 */
function TeamBlock({ team, matchId, side }: { team: Match["home"]; matchId: string; side: "home" | "away" }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:gap-3">
      <Morph name={morphName(matchId, side)}>
        <span className="inline-flex">
          <Crest src={team.crest} name={team.name} size={56} />
        </span>
      </Morph>
      <p className="min-w-0 wrap-break-word font-display text-base font-bold leading-tight sm:text-2xl">{team.name}</p>
    </div>
  );
}
