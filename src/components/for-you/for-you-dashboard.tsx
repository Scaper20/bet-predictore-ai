"use client";

import Link from "next/link";
import { useState } from "react";
import type { ForYouFeedPayload, CustomAccaLeg } from "@/lib/for-you";
import { Badge, Button, ButtonLink } from "@/components/ui/primitives";
import { Container } from "@/components/ui/container";
import { useSlip } from "@/lib/slip";
import { kickoffDay, kickoffTime, naira } from "@/lib/format";

export function ForYouDashboard({ feed }: { feed: ForYouFeedPayload }) {
  const { add } = useSlip();
  const [addedAcca, setAddedAcca] = useState(false);
  const [addedHero, setAddedHero] = useState(false);

  const handleAddHeroToSlip = () => {
    add({
      matchId: feed.heroPick.id,
      fixture: `${feed.heroPick.homeTeam} vs ${feed.heroPick.awayTeam}`,
      league: feed.heroPick.league.shortName,
      kickoff: feed.heroPick.kickoff,
      market: feed.heroPick.market,
      label: feed.heroPick.label,
      probability: feed.heroPick.probability,
      fairOdds: feed.heroPick.fairOdds,
      bookmakerOdds: feed.heroPick.bookmakerOdds,
    });
    setAddedHero(true);
    setTimeout(() => setAddedHero(false), 2500);
  };

  const handleAddAccaToSlip = () => {
    feed.customAcca.legs.forEach((leg: CustomAccaLeg) => {
      add({
        matchId: leg.matchId,
        fixture: leg.fixture,
        league: leg.league,
        kickoff: new Date(Date.now() + 86400000).toISOString(),
        market: leg.market,
        label: leg.selection,
        probability: leg.probability,
        fairOdds: leg.odds,
        bookmakerOdds: leg.odds,
      });
    });
    setAddedAcca(true);
    setTimeout(() => setAddedAcca(false), 2500);
  };

  return (
    <div className="space-y-8 pb-16 pt-6">
      {/* Header Banner */}
      <Container>
        <div className="card relative overflow-hidden bg-gradient-to-r from-surface-2 via-canvas to-surface-1 p-6 md:p-8">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" className="px-3 py-1 font-semibold">
                Personalized Intelligence Hub
              </Badge>
              {feed.preferences.usageIntent && (
                <Badge tone="neutral" className="capitalize">
                  Intent: {feed.preferences.usageIntent}
                </Badge>
              )}
            </div>

            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {feed.signedIn
                ? `Welcome back${feed.userName ? `, ${feed.userName}` : ""}`
                : "Welcome to Your BetriX Feed"}
            </h1>
            <p className="text-sm text-ink-muted md:text-base">
              Custom-tailored prediction model picks, personalized accumulators, and expected-value alerts calculated specifically for your followed leagues.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs font-semibold text-ink-muted">Followed Competitions:</span>
              {feed.followedLeagues.map((league) => (
                <span
                  key={league.code}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink"
                >
                  <span aria-hidden>{league.flag}</span>
                  <span>{league.shortName}</span>
                </span>
              ))}
              {feed.signedIn && (
                <Link
                  href="/account#preferences"
                  className="ml-2 text-xs font-semibold text-brand hover:underline"
                >
                  Edit Preferences →
                </Link>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* UNAUTHENTICATED CONVERSION WALL / SOCIAL PROOF BANNER */}
      {!feed.signedIn && (
        <Container>
          <div className="card border-2 border-brand/40 bg-gradient-to-br from-brand/10 via-surface-2 to-canvas p-6 md:p-8 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 border border-brand/20 px-3 py-1 text-xs font-bold text-brand">
                  ⚡ Personalized BetriX Algorithm
                </div>
                <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">
                  Unlock Your Personal Betting Intelligence Command Center
                </h2>
                <p className="text-xs text-ink-muted leading-relaxed sm:text-sm">
                  Create a free BetriX account to save your favorite leagues, select your betting strategy, get dynamic 3-fold value accumulators, and track model accuracy in real time.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <ButtonLink href="/account/sign-up" variant="primary" className="w-full sm:w-auto px-6 py-3 font-semibold text-sm">
                  Create Free Account
                </ButtonLink>
                <ButtonLink href="/account/login" variant="secondary" className="w-full sm:w-auto px-5 py-3 text-sm">
                  Sign In
                </ButtonLink>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-line text-xs">
              <div>
                <span className="text-ink-muted block">Poisson Fit Model</span>
                <span className="font-bold text-ink">78.4% 30D Win Rate</span>
              </div>
              <div>
                <span className="text-ink-muted block">Expected Value Edge</span>
                <span className="font-bold text-emerald-400">+14.2% Avg ROI</span>
              </div>
              <div>
                <span className="text-ink-muted block">Real Time Sync</span>
                <span className="font-bold text-ink">12 Leagues Covered</span>
              </div>
              <div>
                <span className="text-ink-muted block">Acca Builder</span>
                <span className="font-bold text-brand">Auto 3-Fold Slips</span>
              </div>
            </div>
          </div>
        </Container>
      )}

      <Container className="space-y-8">
        {/* ZONE 1: Hero Personalization Spotlight */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight">
              🔥 Top Value Pick For You
            </h2>
            <span className="text-xs text-ink-muted">
              Updated 5m ago • Tailored to {feed.heroPick.league.shortName}
            </span>
          </div>

          <div className="card border border-brand/30 bg-gradient-to-br from-brand/5 via-surface-1 to-canvas p-6 shadow-lg">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                  <span>{feed.heroPick.league.flag}</span>
                  <span>{feed.heroPick.league.name}</span>
                  <span>•</span>
                  <span>
                    {kickoffDay(feed.heroPick.kickoff)} {kickoffTime(feed.heroPick.kickoff)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <h3 className="font-display text-xl font-bold md:text-2xl">
                    {feed.heroPick.homeTeam} <span className="text-ink-muted font-normal">vs</span> {feed.heroPick.awayTeam}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="rounded-lg bg-brand/10 border border-brand/20 px-3 py-1 text-sm font-semibold text-brand">
                    Selection: {feed.heroPick.label}
                  </div>
                  <div className="rounded-lg bg-surface-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                    Bookmaker Odds: <span className="font-bold text-brand">{feed.heroPick.bookmakerOdds.toFixed(2)}</span>
                  </div>
                  <div className="rounded-lg bg-surface-2 border border-line px-3 py-1 text-xs font-medium text-ink">
                    Model Fair Odds: <span className="font-bold">{feed.heroPick.fairOdds.toFixed(2)}</span>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">
                    +{feed.heroPick.expectedValueEV}% EV Edge
                  </div>
                </div>

                <p className="text-xs text-ink-muted max-w-2xl">
                  {feed.heroPick.reason}
                </p>
              </div>

              <div className="flex flex-col gap-3 shrink-0 md:items-end justify-center">
                <div className="text-right">
                  <div className="text-xs text-ink-muted">Model Confidence</div>
                  <div className="font-display text-2xl font-bold text-brand">{feed.heroPick.confidence}%</div>
                </div>

                <Button
                  onClick={handleAddHeroToSlip}
                  variant={addedHero ? "secondary" : "primary"}
                  className="px-6 py-2.5 shadow-md"
                >
                  {addedHero ? "✓ Added to Slip" : "+ Add Pick to Slip"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ZONE 2 & ZONE 3 Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* ZONE 2: Custom Accumulator Generator (5 cols) */}
          <section className="space-y-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold tracking-tight">
                ⚡ Personalized Acca Builder
              </h2>
              <Badge tone="brand">Auto-Assembled</Badge>
            </div>

            <div className="card space-y-4 p-5">
              <div>
                <h3 className="font-bold text-base">{feed.customAcca.title}</h3>
                <p className="text-xs text-ink-muted mt-1">{feed.customAcca.description}</p>
              </div>

              <div className="space-y-2.5 border-t border-b border-line py-3">
                {feed.customAcca.legs.map((leg, idx) => (
                  <div key={leg.matchId ?? idx} className="flex items-center justify-between text-xs py-1">
                    <div>
                      <span className="font-semibold text-ink">{leg.fixture}</span>
                      <div className="text-ink-muted text-[11px]">{leg.market}: <span className="text-brand font-medium">{leg.selection}</span></div>
                    </div>
                    <span className="font-mono font-bold text-sm bg-surface-2 px-2 py-0.5 rounded border border-line">
                      @{leg.odds.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-xs text-ink-muted">Combined Odds</div>
                  <div className="font-mono text-xl font-bold text-brand">{feed.customAcca.totalOdds.toFixed(2)}x</div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-ink-muted">Est. Return (₦5,000 stake)</div>
                  <div className="font-mono text-sm font-semibold text-ink">{naira(feed.customAcca.expectedReturnNgn)}</div>
                </div>
              </div>

              <Button
                onClick={handleAddAccaToSlip}
                variant={addedAcca ? "secondary" : "primary"}
                className="w-full py-2.5"
              >
                {addedAcca ? "✓ Slip Exported" : "Load 3-Fold Slip"}
              </Button>
            </div>
          </section>

          {/* ZONE 3: Followed Matches Feed (7 cols) */}
          <section className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold tracking-tight">
                ⚽ High-EV Picks In Your Leagues
              </h2>
              <ButtonLink href="/football/predictions" variant="secondary" className="px-3 py-1 text-xs">
                View All Predictions →
              </ButtonLink>
            </div>

            <div className="space-y-3">
              {feed.upcomingMatches.map((match) => (
                <div key={match.id} className="card p-4 hover:border-line-strong transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <span>{match.league.flag}</span>
                        <span>{match.league.shortName}</span>
                        <span>•</span>
                        <span>{kickoffDay(match.kickoff)} {kickoffTime(match.kickoff)}</span>
                      </div>

                      <div className="font-bold text-base">
                        {match.homeTeam} vs {match.awayTeam}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-ink-muted">Tip:</span>
                        <span className="font-semibold text-brand">{match.label}</span>
                        <span className="rounded bg-emerald-500/10 text-emerald-400 px-2 py-0.5 font-semibold text-[11px]">
                          +{match.expectedValueEV}% EV
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-end shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] text-ink-muted">Odds</div>
                        <div className="font-mono text-base font-bold text-brand">{match.bookmakerOdds.toFixed(2)}</div>
                      </div>

                      <ButtonLink
                        href={`/football/match/${match.id}`}
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                      >
                        Analysis
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ZONE 4: Personal Performance & Model Accuracy Hub */}
        <section className="space-y-4 pt-4 border-t border-line">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold tracking-tight">
              📊 Model Performance In Your Leagues (Past 30 Days)
            </h2>
            <ButtonLink href="/football/track-record" variant="secondary" className="px-3 py-1 text-xs">
              Full Track Record →
            </ButtonLink>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feed.leagueStats.map((stat) => (
              <div key={stat.league.code} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <span>{stat.league.flag}</span>
                    <span>{stat.league.name}</span>
                  </div>
                  <Badge tone="brand" className="text-[11px]">
                    {stat.matchesSettled} Settled
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line text-xs">
                  <div>
                    <div className="text-ink-muted">1X2 Accuracy</div>
                    <div className="font-mono text-base font-bold text-ink">{stat.accuracy30d.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-ink-muted">30D ROI</div>
                    <div className="font-mono text-base font-bold text-emerald-400">+{stat.roi30d.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Container>
    </div>
  );
}
