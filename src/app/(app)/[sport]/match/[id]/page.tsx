import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { isStrong } from "@/lib/model/tiers";
import { StrongBadge } from "@/components/ui/strong-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { matchPath, sportPath, scoresPath } from "@/lib/routes";
import { BttsPanel, CorrectScorePanel, DoubleChancePanel, GoalsPanel, H2HPanel, OutcomePanel } from "@/components/match/market-panels";
import { AddToSlip } from "@/components/match/add-to-slip";
import { MatchTabs, type MatchTab } from "@/components/match/match-tabs";
import { MatchStats } from "@/components/match/match-stats";
import { LeagueTable } from "@/components/stats/league-table";
import { SplitBar } from "@/components/stats/split-bar";
import { FormPips } from "@/components/stats/form-pips";
import { Morph, morphName } from "@/components/motion/morph";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { matchContext, type MatchContext } from "@/lib/stats/match-context";
import type { Outcome } from "@/lib/stats/compute";
import { AskAboutMatch, AskPageContext } from "@/components/ask/ask-page-context";
import { PricesPanel, PricesPanelSkeleton } from "@/components/match/prices-panel";
import { TopPicks } from "@/components/match/top-picks";
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
import { LockedNumber } from "@/components/entitlements/locked-pick";
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
    { key: "overview", label: "Overview", panel: <Overview match={match} prediction={prediction} ctx={ctx} live={live} label={label} proLeagueOpened={proLeagueOpened} /> },
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
}: {
  match: Match;
  prediction: ViewedPrediction;
  ctx: MatchContext;
  live: boolean;
  proLeagueOpened: boolean;
  label: string;
}) {
  const pick = prediction.topPick;
  const homeForm: Outcome[] = ctx.home?.form.letters ?? prediction.form.home.entries.map((e) => e.result as Outcome);
  const awayForm: Outcome[] = ctx.away?.form.letters ?? prediction.form.away.entries.map((e) => e.result as Outcome);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0 space-y-5">
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
          <section className="orbit-border card rounded-2xl p-5 sm:p-6">
            <p className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.14em] text-ink-dim">
              <span className="whitespace-nowrap">Our pick</span> {isStrong(pick, match.league.code) && <StrongBadge />} <RiskBadge pick={pick} />
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <p className="font-display text-2xl font-bold text-ink sm:text-3xl">{pick.label}</p>
              <div className="text-right">
                <AnimatedNumber value={pick.probability * 100} decimals={1} suffix="%" className="font-mono tracking-tighter text-2xl font-semibold text-brand sm:text-3xl" />
              </div>
            </div>
            {prediction.sufficiency.level === "limited" && (
              <p className="mt-2 text-xs text-amber">Thin data · treat as a guide</p>
            )}
            {proLeagueOpened && <ProLeagueAfterKickoff />}
          </section>
        ) : (
          <section className="card p-5">
            <p className="text-sm font-semibold text-amber">No pick for this game</p>
            <p className="mt-1 text-xs text-ink-dim">Not enough history to publish one yet.</p>
          </section>
        )}

        {prediction.locked.markets ? (
          <div className="stagger grid grid-cols-3 gap-3">
            {["xG", "Over 2.5", "Both score"].map((l, i) => (
              <Fact key={l} index={i} label={l} value={<LockedNumber />} />
            ))}
          </div>
        ) : (
          <div className="stagger grid grid-cols-3 gap-3">
            <Fact index={0} label="xG" value={`${prediction.markets.expectedGoals.home.toFixed(1)} – ${prediction.markets.expectedGoals.away.toFixed(1)}`} />
            <Fact index={1} label="Over 2.5" value={percent(prediction.markets.over["2.5"])} hot={prediction.markets.over["2.5"] >= 0.6} />
            <Fact index={2} label="Both score" value={percent(prediction.markets.bttsYes)} hot={prediction.markets.bttsYes >= 0.6} />
          </div>
        )}

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

function Fact({ label, value, hot = false, index }: { label: string; value: React.ReactNode; hot?: boolean; index: number }) {
  return (
    <div style={{ ["--i" as string]: index }} className={`min-w-0 rounded-xl border px-2 py-3 text-center sm:px-3 ${hot ? "border-brand/25 bg-brand/[0.06]" : "border-line bg-surface"}`}>
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className={`tnum mt-1 whitespace-nowrap font-mono tracking-tighter text-sm font-medium min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl sm:tracking-tight ${hot ? "text-brand" : "text-ink"}`}>{value}</p>
    </div>
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
        <OutcomePanel prediction={prediction} />
        <ProLeagueMarketsLock leagueCode={prediction.match.league.code} leagueName={prediction.match.league.name} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {/* Free and server-rendered: the 1X2 split is what search indexes and
          what earns the click, so it never sits behind a wall (lib/gating.ts). */}
      <TopPicks prediction={prediction} corners={extra?.stats.corners} />
      <OutcomePanel prediction={prediction} />
      {/* The only numbers here a bookmaker produced; streamed, because two
          metered providers sit behind it. DepthGate is a conversion wall:
          both providers are fetched a competition at a time and cached. */}
      <DepthGate reason="Is the market price worth it?">
        <Suspense fallback={<PricesPanelSkeleton />}>
          <PricesPanel prediction={prediction} />
        </Suspense>
      </DepthGate>
      {/* Every market beyond 1X2 comes off the same scoreline distribution,
          so depth is one decision, not five: a free account opens it. */}
      <DepthGate reason="Unlock every market on this match">
        <GoalsPanel prediction={prediction} />
        <div className="grid gap-5 sm:grid-cols-2">
          <BttsPanel prediction={prediction} />
          <DoubleChancePanel prediction={prediction} />
        </div>
        <CorrectScorePanel prediction={prediction} />
        {extra && <GoalExtrasPanel goals={extra.goals} match={prediction.match} />}
        {extra &&
          (["corners", "cards", "shots", "shotsOnTarget"] as const).map((kind) => {
            const m = extra.stats[kind];
            return m ? <StatPanel key={kind} kind={kind} markets={m} match={prediction.match} referee={extra.referee} /> : null;
          })}
        {statsLocked && <ProStatsLock />}
        {/* Pro: every extra line SportyBet lists, priced by the model (handicaps, team goals, corners, shots, bookings). */}
        {!statsLocked && (
          <Suspense fallback={<SportyBetLinesSkeleton />}>
            <SportyBetLinesPanel prediction={prediction} />
          </Suspense>
        )}
      </DepthGate>
      {/* Pro: half-time markets and Asian handicap, fetched after the plan check. */}
      <ProMarkets />
    </div>
  );
}

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
