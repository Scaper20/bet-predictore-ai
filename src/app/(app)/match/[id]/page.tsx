import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ButtonLink } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import {
  AsianHandicapPanel, BttsPanel, CorrectScorePanel, DoubleChancePanel, FormPanel, GoalsPanel,
  H2HPanel, OutcomePanel,
} from "@/components/match/market-panels";
import { ModelPanel } from "@/components/match/model-panel";
import { ValueCalculator } from "@/components/match/value-calculator";
import { AddToSlip } from "@/components/match/add-to-slip";
import { Gate } from "@/components/entitlements/gate";
import { matchDetail } from "@/lib/service";
import { kickoffTime, odds, percent, relativeDay, statusLabel, isLive } from "@/lib/format";

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
      {/* ------------------------------------------------------ Match header */}
      <div className="border-b border-line bg-shell">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
                {percent(prediction.topPick.probability, 1)} · fair {odds(prediction.topPick.fairOdds)}
              </span>
              <Badge tone={prediction.topPick.confidence >= 55 ? "brand" : "amber"}>
                {Math.round(prediction.topPick.confidence)}/100 confidence
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- Body */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-5">
            <AnalysisPanel analysis={analysis} />
            <OutcomePanel prediction={prediction} />
            <GoalsPanel prediction={prediction} />
            <div className="grid gap-5 sm:grid-cols-2">
              <BttsPanel prediction={prediction} />
              <DoubleChancePanel prediction={prediction} />
            </div>
            <CorrectScorePanel prediction={prediction} />
            <Gate requires="pass">
              <AsianHandicapPanel prediction={prediction} />
            </Gate>
            <FormPanel prediction={prediction} />
            <H2HPanel prediction={prediction} />
          </div>

          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
            <ModelPanel prediction={prediction} trainedOn={trainedOn} />
            <AddToSlip prediction={prediction} />
            <Gate requires="pass">
              <ValueCalculator prediction={prediction} />
            </Gate>
            <div className="card p-5">
              <p className="text-[11px] leading-relaxed text-ink-dim">
                Probabilities are estimates from a statistical model, not predictions of fact.
                Odds shown are fair prices with no margin. Bet responsibly — 18+.
              </p>
              <ButtonLink href="/how-it-works" variant="ghost" className="mt-3 px-0 py-1 text-xs">
                How this is calculated →
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

function AnalysisPanel({
  analysis,
}: {
  analysis: { headline: string; body: string[]; factors: string[]; source: "claude" | "model" };
}) {
  const isAiWritten = analysis.source === "claude";
  // The deterministic write-up is the free-tier baseline; the AI rewrite is
  // a Pro perk. matchDetail() computes one shared, cached analysis per match
  // (not per user — reading the session there would break the page's ISR
  // caching, see AppLayout's comment), so gating happens here at display
  // time instead: everyone gets the headline and opening paragraph, the rest
  // of an AI-written piece sits behind Gate.
  const [lead, ...rest] = analysis.body;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Match analysis
        </h2>
        <Badge tone={isAiWritten ? "violet" : "neutral"}>
          {isAiWritten ? "AI written" : "Model generated"}
        </Badge>
      </div>

      <h3 className="font-display text-xl font-bold leading-snug">{analysis.headline}</h3>

      <div className="mt-4 space-y-3.5">
        {lead && <p className="text-sm leading-relaxed text-ink-muted">{lead}</p>}

        {isAiWritten ? (
          <Gate
            requires="pro"
            fallback={
              rest.length > 0 || analysis.factors.length > 0 ? (
                <p className="text-xs text-ink-dim">
                  The rest of this AI-written briefing is a{" "}
                  <a href="/account/billing?plan=pro" className="text-brand underline underline-offset-2">
                    Pro
                  </a>{" "}
                  feature.
                </p>
              ) : null
            }
          >
            <AnalysisRest body={rest} factors={analysis.factors} />
          </Gate>
        ) : (
          <AnalysisRest body={rest} factors={analysis.factors} />
        )}
      </div>
    </section>
  );
}

function AnalysisRest({ body, factors }: { body: string[]; factors: string[] }) {
  return (
    <>
      {body.map((para, i) => (
        <p key={i} className="text-sm leading-relaxed text-ink-muted">
          {para}
        </p>
      ))}
      {factors.length > 0 && (
        <ul className="mt-1.5 space-y-2 border-t border-line pt-5">
          {factors.map((f, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-ink-muted">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
