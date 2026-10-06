import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, ButtonLink, LiveDot } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { isStrong } from "@/lib/model/tiers";
import { StrongBadge } from "@/components/ui/strong-badge";
import { matchPath, sportPath } from "@/lib/routes";
import {
  BttsPanel, CorrectScorePanel, DoubleChancePanel, GoalsPanel,
  H2HPanel, OutcomePanel,
} from "@/components/match/market-panels";
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
import type { Analysis } from "@/lib/ai/analyst";
import { AskAboutMatch, AskPageContext } from "@/components/ask/ask-page-context";
import { PricesPanel, PricesPanelSkeleton } from "@/components/match/prices-panel";
import { AsianHandicapClient } from "@/components/match/asian-handicap-client";
import { AnalysisPanel } from "@/components/match/analysis-panel";
import { LiveWinProbabilityPanel } from "@/components/match/live-win-probability-panel";
import { Gate } from "@/components/entitlements/gate";
import { DepthGate } from "@/components/entitlements/depth-gate";
import { JsonLd } from "@/components/seo/json-ld";
import { matchDetail } from "@/lib/service";
import { SITE_URL as SITE } from "@/lib/site-url";
import { kickoffDay, kickoffTime, percent, relativeDay, statusLabel, isLive } from "@/lib/format";
import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { containerClass } from "@/components/ui/container";
import { matchProgress } from "@/lib/live-board";

/**
 * SportsEvent structured data — schema.org's real, documented vocabulary
 * for this (homeTeam/awayTeam/location all confirmed against schema.org
 * directly, not assumed). This produces valid structured data; it is not a
 * guarantee of a visible Google rich-result, since Google's specific rich-
 * result support for this type isn't something either party can confirm
 * from here.
 */
function matchJsonLd(match: Match, prediction: Prediction) {
  const url = `${SITE}${matchPath(match.id)}`;
  const m = prediction.markets;
  const predictionsUrl = `${SITE}${sportPath("predictions")}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsEvent",
        name: `${match.home.name} vs ${match.away.name}`,
        // The canonical sport-scoped URL — /match/:id is a 308 to it, and
        // structured data should never point at a redirect.
        url,
        startDate: match.kickoff,
        eventStatus: "https://schema.org/EventScheduled",
        sport: "Football",
        description:
          `${match.league.name}: ${match.home.name} vs ${match.away.name}. Model probabilities ` +
          `${percent(m.home)} home win, ${percent(m.draw)} draw, ${percent(m.away)} away win; ` +
          `${m.expectedGoals.total.toFixed(2)} expected goals.`,
        homeTeam: { "@type": "SportsTeam", name: match.home.name },
        awayTeam: { "@type": "SportsTeam", name: match.away.name },
        competitor: [
          { "@type": "SportsTeam", name: match.home.name },
          { "@type": "SportsTeam", name: match.away.name },
        ],
        superEvent: { "@type": "SportsEvent", name: match.league.name },
        ...(match.venue ? { location: { "@type": "Place", name: match.venue } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE },
          { "@type": "ListItem", position: 2, name: "Predictions", item: predictionsUrl },
          ...(match.league.code
            ? [{
                "@type": "ListItem",
                position: 3,
                name: match.league.name,
                item: `${predictionsUrl}?league=${match.league.code}`,
              }]
            : []),
          {
            "@type": "ListItem",
            position: match.league.code ? 4 : 3,
            name: `${match.home.name} vs ${match.away.name}`,
            item: url,
          },
        ],
      },
    ],
  };
}

export const revalidate = 60;

// Nothing prerendered at build — fixtures change daily — but declaring the
// list makes each match page cacheable for `revalidate` once first requested,
// instead of re-rendering (and re-calling the feeds) on every visit.
export function generateStaticParams() {
  return [];
}

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
      `${percent(prediction.markets.away)} away, with ${prediction.markets.expectedGoals.total.toFixed(2)} expected goals.`,
    alternates: { canonical: matchPath(match.id) },
    openGraph: { title, type: "article" },
  };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) notFound();

  const { match, prediction, analysis } = detail;
  const ctx = await matchContext(match).catch((): MatchContext => ({ teamIds: { home: null, away: null }, home: null, away: null, table: null }));
  const live = isLive(match);
  const label = `${match.home.name} v ${match.away.name}`;

  const tabs: MatchTab[] = [
    { key: "overview", label: "Overview", panel: <Overview match={match} prediction={prediction} analysis={analysis} ctx={ctx} live={live} label={label} /> },
    { key: "markets", label: "Markets", panel: <Markets prediction={prediction} matchId={match.id} /> },
    { key: "stats", label: "Stats", panel: <MatchStats match={match} home={ctx.home} away={ctx.away} /> },
    ...(ctx.table
      ? [{
          key: "table",
          label: "Table",
          panel: (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{match.league.name}</h2>
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
      <JsonLd data={matchJsonLd(match, prediction)} />
      <AskPageContext matchId={match.id} label={label} />

      {/* ------------------------------------------------------ Scoreboard */}
      <h1 className="sr-only">
        {match.home.name} vs {match.away.name} prediction, {match.league.name}
      </h1>
      <header className="relative overflow-hidden border-b border-line bg-shell">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_-10%,color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_70%)]" />
        <div className={`${containerClass()} relative py-5 sm:py-8`}>
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-2.5">
              {match.league.logo && <Crest src={match.league.logo} name={match.league.name} size={18} />}
              <Link href={`${sportPath("fixtures")}?league=${match.league.code ?? ""}`} className="min-w-0 truncate text-xs font-medium text-ink-muted hover:text-ink sm:text-sm">
                {match.league.name}
                {match.round && <span className="text-ink-dim"> · {match.round}</span>}
              </Link>
              <span className="ml-auto shrink-0">
                {live ? (
                  <Badge tone="live"><LiveDot />{statusLabel(match)}</Badge>
                ) : match.status === "finished" ? (
                  <Badge tone="neutral">Full time</Badge>
                ) : match.status === "postponed" ? (
                  <Badge tone="amber">Postponed</Badge>
                ) : (
                  <Badge tone="neutral">{relativeDay(match.kickoff)}</Badge>
                )}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:mt-7 sm:gap-8">
              <TeamBlock team={match.home} matchId={match.id} side="home" />
              <div className="text-center">
                {live || match.status === "finished" ? (
                  <p className="tnum font-display text-4xl font-extrabold leading-none sm:text-6xl">
                    {match.score.home ?? 0}
                    <span className="mx-1.5 text-ink-dim sm:mx-3">-</span>
                    {match.score.away ?? 0}
                  </p>
                ) : (
                  <p className="tnum font-display text-3xl font-bold leading-none sm:text-5xl">{kickoffTime(match.kickoff)}</p>
                )}
                {live ? (
                  <div className="mx-auto mt-2.5 w-16">
                    <span className="block h-0.5 overflow-hidden rounded-full bg-line" aria-hidden>
                      <span className="block h-full rounded-full bg-rose" style={{ width: `${Math.round(matchProgress(match) * 100)}%` }} />
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-ink-dim sm:text-xs">
                    {match.status === "finished" ? kickoffDay(match.kickoff) : `${kickoffDay(match.kickoff)} · WAT`}
                  </p>
                )}
              </div>
              <TeamBlock team={match.away} matchId={match.id} side="away" />
            </div>

            <div className="mx-auto mt-6 max-w-xl sm:mt-8">
              <div className="mb-2 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
                <span>Model&apos;s read</span>
                {match.venue && <span className="truncate pl-3 normal-case tracking-normal">{match.venue}</span>}
              </div>
              <SplitBar home={prediction.markets.home} draw={prediction.markets.draw} away={prediction.markets.away} size="lg" />
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ Tabs */}
      <div className={`${containerClass()} pb-10 sm:pb-14`}>
        <div className="mx-auto max-w-5xl">
          <MatchTabs tabs={tabs} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- Overview */

function Overview({
  match,
  prediction,
  analysis,
  ctx,
  live,
  label,
}: {
  match: Match;
  prediction: Prediction;
  analysis: Analysis;
  ctx: MatchContext;
  live: boolean;
  label: string;
}) {
  const m = prediction.markets;
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
              <div className="card border-brand/25 bg-brand/[0.04] p-5">
                <p className="flex items-center gap-2 text-sm font-semibold"><LiveDot /> Live win probability</p>
                <p className="mt-1 text-xs text-ink-muted">Updates every ~25s as the match plays out. VIP unlocks this.</p>
                <ButtonLink href="/account/billing?plan=vip" variant="ghost" className="mt-2 px-0 py-1 text-xs">Unlock VIP →</ButtonLink>
              </div>
            }
          >
            <LiveWinProbabilityPanel matchId={match.id} />
          </Gate>
        )}

        {pick && prediction.sufficiency.publishable ? (
          <section className="orbit-border card rounded-2xl p-5 sm:p-6">
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
              Our pick {isStrong(pick) && <StrongBadge />}
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <p className="font-display text-2xl font-bold text-ink sm:text-3xl">{pick.label}</p>
              <div className="text-right">
                <AnimatedNumber value={pick.probability * 100} decimals={1} suffix="%" className="font-display text-3xl font-extrabold text-brand sm:text-4xl" />
              </div>
            </div>
            {prediction.sufficiency.level === "limited" && (
              <p className="mt-2 text-xs text-amber">Thin data · treat as a guide</p>
            )}
          </section>
        ) : (
          <section className="card p-5">
            <p className="text-sm font-semibold text-amber">No pick for this game</p>
            <p className="mt-1 text-xs text-ink-dim">Not enough history to publish one yet.</p>
          </section>
        )}

        <div className="stagger grid grid-cols-3 gap-3">
          <Fact index={0} label="xG" value={`${m.expectedGoals.home.toFixed(1)} – ${m.expectedGoals.away.toFixed(1)}`} />
          <Fact index={1} label="Over 2.5" value={percent(m.over["2.5"])} hot={m.over["2.5"] >= 0.6} />
          <Fact index={2} label="Both score" value={percent(m.bttsYes)} hot={m.bttsYes >= 0.6} />
        </div>

        {(homeForm.length > 0 || awayForm.length > 0) && (
          <section className="card p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">Form</h2>
              <a href="#stats" className="text-xs font-medium text-brand hover:underline">Full stats →</a>
            </div>
            <div className="space-y-3">
              <FormLine team={match.home} letters={homeForm} />
              <FormLine team={match.away} letters={awayForm} />
            </div>
          </section>
        )}

        <AnalysisPanel analysis={analysis} matchId={match.id} />
      </div>

      <aside className="min-w-0 space-y-5 lg:sticky lg:top-[calc(var(--header-h)+4.5rem)]">
        <AddToSlip prediction={prediction} />
        <AskAboutMatch label={label} />
        <p className="px-1 text-[11px] leading-relaxed text-ink-dim">
          Model estimates, not facts. 18+, bet responsibly.{" "}
          <Link href={sportPath("trackRecord")} className="text-ink-muted underline-offset-2 hover:underline">See our record</Link>
        </p>
      </aside>
    </div>
  );
}

function Fact({ label, value, hot = false, index }: { label: string; value: string; hot?: boolean; index: number }) {
  return (
    <div style={{ ["--i" as string]: index }} className={`rounded-xl border px-3 py-3 text-center ${hot ? "border-brand/25 bg-brand/[0.06]" : "border-line bg-surface"}`}>
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-dim">{label}</p>
      <p className={`tnum mt-1 font-display text-lg font-bold sm:text-xl ${hot ? "text-brand" : "text-ink"}`}>{value}</p>
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

function Markets({ prediction, matchId }: { prediction: Prediction; matchId: string }) {
  return (
    <div className="space-y-5">
      {/* Free and server-rendered: the 1X2 split is what search indexes and
          what earns the click, so it never sits behind a wall (lib/gating.ts). */}
      <OutcomePanel prediction={prediction} />
      {/* The only numbers here a bookmaker produced; streamed, because two
          metered providers sit behind it. DepthGate is a conversion wall:
          both providers are fetched a competition at a time and cached. */}
      <DepthGate reason="Is the bookie's price worth it?">
        <Suspense fallback={<PricesPanelSkeleton />}>
          <PricesPanel prediction={prediction} />
        </Suspense>
      </DepthGate>
      {/* Every market beyond 1X2 comes off the same scoreline distribution,
          so depth is one decision, not five. */}
      <DepthGate reason="Unlock every market on this match">
        <GoalsPanel prediction={prediction} />
        <div className="grid gap-5 sm:grid-cols-2">
          <BttsPanel prediction={prediction} />
          <DoubleChancePanel prediction={prediction} />
        </div>
        <CorrectScorePanel prediction={prediction} />
      </DepthGate>
      <Gate requires="pass">
        <AsianHandicapClient matchId={matchId} />
      </Gate>
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
