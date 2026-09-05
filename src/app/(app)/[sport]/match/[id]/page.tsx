import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ButtonLink } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { sportPath } from "@/lib/routes";
import {
  BttsPanel, CorrectScorePanel, DoubleChancePanel, FormPanel, GoalsPanel,
  H2HPanel, OutcomePanel,
} from "@/components/match/market-panels";
import { ModelPanel } from "@/components/match/model-panel";
import { ValueCalculator } from "@/components/match/value-calculator";
import { AddToSlip } from "@/components/match/add-to-slip";
import { PricesPanel, PricesPanelSkeleton } from "@/components/match/prices-panel";
import { AsianHandicapClient } from "@/components/match/asian-handicap-client";
import { AnalysisPanel } from "@/components/match/analysis-panel";
import { LiveWinProbabilityPanel } from "@/components/match/live-win-probability-panel";
import { Gate } from "@/components/entitlements/gate";
import { DepthGate } from "@/components/entitlements/depth-gate";
import { JsonLd } from "@/components/seo/json-ld";
import { matchDetail } from "@/lib/service";
import { SITE_URL as SITE } from "@/lib/site-url";
import { kickoffTime, odds, percent, relativeDay, statusLabel, isLive } from "@/lib/format";
import type { Match } from "@/lib/types";
import { containerClass } from "@/components/ui/container";

/**
 * SportsEvent structured data — schema.org's real, documented vocabulary
 * for this (homeTeam/awayTeam/location all confirmed against schema.org
 * directly, not assumed). This produces valid structured data; it is not a
 * guarantee of a visible Google rich-result, since Google's specific rich-
 * result support for this type isn't something either party can confirm
 * from here.
 */
function matchJsonLd(match: Match) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.home.name} vs ${match.away.name}`,
    startDate: match.kickoff,
    sport: "Football",
    homeTeam: { "@type": "SportsTeam", name: match.home.name },
    awayTeam: { "@type": "SportsTeam", name: match.away.name },
    ...(match.venue ? { location: { "@type": "Place", name: match.venue } } : {}),
    url: `${SITE}/match/${encodeURIComponent(match.id)}`,
  };
}

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) return { title: "Match not found" };

  const { match, prediction } = detail;
  const title = `${match.home.name} vs ${match.away.name} prediction`;
  return {
    title,
    description:
      `Model probabilities for ${match.home.name} vs ${match.away.name} in the ${match.league.name}: ` +
      `${percent(prediction.markets.home)} home, ${percent(prediction.markets.draw)} draw, ` +
      `${percent(prediction.markets.away)} away, with ${prediction.markets.expectedGoals.total.toFixed(2)} expected goals.`,
    openGraph: { title, type: "article" },
  };
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await matchDetail(decodeURIComponent(id)).catch(() => null);
  if (!detail) notFound();

  const { match, prediction, analysis, trainedOn } = detail;
  const live = isLive(match);

  return (
    <>
      <JsonLd data={matchJsonLd(match)} />

      {/* ------------------------------------------------------ Match header */}
      <div className="border-b border-line bg-shell">
        <div className={`${containerClass()} py-7 sm:py-10`}>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {match.league.logo && <Crest src={match.league.logo} name={match.league.name} size={22} />}
            <span className="text-sm font-medium text-ink-muted">{match.league.name}</span>
            {match.round && <span className="text-xs text-ink-dim">· {match.round}</span>}
            <span className="ml-auto">
              {live ? (
                <Badge tone="live">{statusLabel(match)}</Badge>
              ) : match.status === "finished" ? (
                <Badge tone="neutral">Full time</Badge>
              ) : (
                <Badge tone="neutral">
                  {relativeDay(match.kickoff)} · {kickoffTime(match.kickoff)} WAT
                </Badge>
              )}
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            <TeamBlock team={match.home} align="right" />
            <div className="text-center">
              {live || match.status === "finished" ? (
                <p className="tnum font-display text-4xl font-extrabold sm:text-5xl">
                  {match.score.home ?? 0}
                  <span className="mx-2 text-ink-dim">-</span>
                  {match.score.away ?? 0}
                </p>
              ) : (
                <p className="tnum font-display text-2xl font-bold text-ink-muted sm:text-3xl">
                  {kickoffTime(match.kickoff)}
                </p>
              )}
              {match.venue && <p className="mt-2 max-w-[12rem] text-xs text-ink-dim">{match.venue}</p>}
            </div>
            <TeamBlock team={match.away} align="left" />
          </div>

          {prediction.topPick && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-brand/25 bg-brand/[0.06] px-5 py-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                Model&apos;s strongest read
              </span>
              <span className="text-base font-bold text-brand">{prediction.topPick.label}</span>
              <span className="tnum text-sm text-ink-muted">
                {percent(prediction.topPick.probability, 1)} · needs{" "}
                {odds(prediction.topPick.fairOdds)}+
              </span>
              <Badge tone={prediction.topPick.confidence >= 55 ? "brand" : "amber"}>
                {Math.round(prediction.topPick.confidence)}/100 confidence
              </Badge>
              {/*
                The clause that turns a probability into a decision. Backtested
                over three seasons this model returns about -2% at
                market-average closing prices: close to the market, not ahead
                of it. So the money question is never "will this land" but
                "is the price long enough", and below break-even the answer is
                no at any hit rate.
              */}
              <span className="w-full text-center text-[11px] text-ink-dim">
                Below that price it loses money however often it lands.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- Body */}
      <div className={`${containerClass()} py-7 sm:py-10`}>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            {live && (
              <Gate
                requires="vip"
                fallback={
                  <div className="card border-brand/25 bg-brand/[0.04] p-5">
                    <p className="text-sm font-semibold">🔴 Live win probability</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Updates every ~25s as the match plays out — VIP unlocks this.
                    </p>
                    <ButtonLink href="/account/billing?plan=vip" variant="ghost" className="mt-2 px-0 py-1 text-xs">
                      Unlock VIP →
                    </ButtonLink>
                  </div>
                }
              >
                <LiveWinProbabilityPanel matchId={match.id} />
              </Gate>
            )}
            <AnalysisPanel analysis={analysis} matchId={match.id} />

            {/*
              Free, and server-rendered: the headline read, the 1X2 split,
              form and head-to-head. That is what a crawler indexes and what
              earns the click from search, so it must never sit behind the
              wall — see the note in src/lib/gating.ts.
            */}
            <OutcomePanel prediction={prediction} />

            {/*
              The only numbers on this page a bookmaker produced. Streamed,
              because two metered providers sit behind it and the rest of the
              match must not wait on them.

              DepthGate is soft — the children render server-side either way —
              so this is a conversion wall, not a spend control. The spend
              control is that both providers are fetched a whole competition
              at a time and cached, so a thousand visitors to this page cost
              exactly what one costs.
            */}
            <DepthGate reason="See the price you are actually being offered">
              <Suspense fallback={<PricesPanelSkeleton />}>
                <PricesPanel prediction={prediction} />
              </Suspense>
            </DepthGate>

            {/*
              Depth needs an account. Every market beyond 1X2 comes off the
              same scoreline distribution, so this is one decision, not five.
            */}
            <DepthGate reason="See every market on this match">
              <GoalsPanel prediction={prediction} />
              <div className="grid gap-5 sm:grid-cols-2">
                <BttsPanel prediction={prediction} />
                <DoubleChancePanel prediction={prediction} />
              </div>
              <CorrectScorePanel prediction={prediction} />
            </DepthGate>

            <Gate requires="pass">
              <AsianHandicapClient matchId={match.id} />
            </Gate>
            <FormPanel prediction={prediction} />
            <H2HPanel prediction={prediction} />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            {/*
              Sample size, data quality and confidence are the "show your
              working" panel — the reason to trust a number rather than the
              number itself. Worth an account, not a payment.
            */}
            <DepthGate reason="See the sample size behind this prediction">
              <ModelPanel prediction={prediction} trainedOn={trainedOn} />
            </DepthGate>
            <AddToSlip prediction={prediction} />
            <Gate requires="pass">
              <ValueCalculator prediction={prediction} />
            </Gate>
            <div className="card p-5">
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Probabilities are estimates from a statistical model, not predictions of fact.
                Prices shown are break-even — no bookmaker margin added — so they are the floor a
                real price has to clear, not a price on offer. Bet responsibly — 18+.
              </p>
              <ButtonLink
                href={sportPath("trackRecord")}
                variant="ghost"
                className="mt-3 px-0 py-1 text-xs"
              >
                See our settled record →
              </ButtonLink>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function TeamBlock({ team, align }: { team: { name: string; crest?: string }; align: "left" | "right" }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        align === "right" ? "flex-row-reverse text-right" : "text-left"
      }`}
    >
      <Crest src={team.crest} name={team.name} size={48} />
      <h1 className="min-w-0 font-display text-lg font-bold leading-tight sm:text-2xl">
        {team.name}
      </h1>
    </div>
  );
}
