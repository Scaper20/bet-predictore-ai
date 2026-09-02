import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, EmptyState, ProbabilityBar } from "@/components/ui/primitives";
import { Crest } from "@/components/ui/crest";
import { supabasePublic } from "@/lib/supabase/public";
import { getMatch } from "@/lib/providers";
import { kickoffDay, kickoffTime, odds, percent } from "@/lib/format";

// A settled prediction never changes after the fact (predictions_log rows are
// upserted freely pre-kickoff, then left alone — see migration 0002's own
// comment), so this can sit behind a long revalidate window unlike the live
// /match/[id] page's revalidate = 60.
export const revalidate = 86400;

interface PredictionRow {
  match_id: string;
  league: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fair_odds: number;
  published_at: string;
  result: "win" | "lose" | "push" | null;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  settled_at: string | null;
}

interface Enrichment {
  homeCrest?: string;
  awayCrest?: string;
  venue?: string | null;
}

async function loadMatch(matchId: string) {
  const supabase = supabasePublic();
  if (!supabase) return { configured: false as const };

  const { data } = await supabase
    .from("predictions_log")
    .select("*")
    .eq("match_id", matchId)
    .not("settled_at", "is", null)
    .maybeSingle();

  if (!data) return { configured: true as const, prediction: null };

  // Best-effort visual enrichment only — never touches the prediction
  // snapshot or result, and never blocks rendering if the provider can't
  // find a match this old (see AGENTS context: predictions_log + our own
  // match_results are the durable record; the live provider is a bonus on
  // top, not a dependency). No write-back here — that stays confined to its
  // one existing trigger point (src/lib/settlement-runner.ts).
  const live = await getMatch(matchId).catch(() => null);
  const enrichment: Enrichment | undefined = live
    ? { homeCrest: live.home.crest, awayCrest: live.away.crest, venue: live.venue }
    : undefined;

  return { configured: true as const, prediction: data as PredictionRow, enrichment };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchId: string }>;
}): Promise<Metadata> {
  const { matchId } = await params;
  const result = await loadMatch(decodeURIComponent(matchId));
  if (!result.configured || !result.prediction) return { title: "Match not found" };

  const { home_name, away_name } = result.prediction;
  return { title: `${home_name} vs ${away_name} — Track Record` };
}

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const result = await loadMatch(decodeURIComponent(matchId));

  if (!result.configured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <EmptyState
          icon="📊"
          title="Not available yet"
          description="This page needs Supabase configured to read settlement history. Check back soon."
        />
      </div>
    );
  }

  if (!result.prediction) notFound();

  const { prediction, enrichment } = result;
  const tone = prediction.result === "win" ? "brand" : prediction.result === "lose" ? "rose" : "neutral";
  const settled = prediction.actual_home_goals !== null && prediction.actual_away_goals !== null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ButtonLink href="/track-record" variant="ghost" className="mb-6 px-0 py-1 text-xs">
        ← Back to Track Record
      </ButtonLink>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
          <span className="font-medium text-ink-muted">{prediction.league}</span>
          <span>·</span>
          <span>{kickoffDay(prediction.kickoff)}</span>
          <span>·</span>
          <span>{kickoffTime(prediction.kickoff)} WAT</span>
          {enrichment?.venue && (
            <>
              <span>·</span>
              <span>{enrichment.venue}</span>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex min-w-0 flex-row-reverse items-center gap-3 text-right">
            <Crest src={enrichment?.homeCrest} name={prediction.home_name} size={40} />
            <h1 className="min-w-0 font-display text-base font-bold leading-tight sm:text-xl">
              {prediction.home_name}
            </h1>
          </div>
          <div className="text-center">
            {settled ? (
              <p className="tnum font-display text-3xl font-extrabold sm:text-4xl">
                {prediction.actual_home_goals}
                <span className="mx-2 text-ink-dim">-</span>
                {prediction.actual_away_goals}
              </p>
            ) : (
              <p className="text-xs text-ink-dim">vs</p>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-3 text-left">
            <Crest src={enrichment?.awayCrest} name={prediction.away_name} size={40} />
            <h1 className="min-w-0 font-display text-base font-bold leading-tight sm:text-xl">
              {prediction.away_name}
            </h1>
          </div>
        </div>
      </div>

      <div className="card mt-5 p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
          Model output at time of prediction
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">{prediction.label}</p>
        <div className="mt-3">
          <ProbabilityBar
            value={prediction.probability}
            tone="brand"
            label="Predicted probability"
            sublabel={percent(prediction.probability, 1)}
          />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Fair odds <span className="tnum font-medium text-ink">{odds(prediction.fair_odds)}</span>
          <span className="mx-2 text-ink-dim">·</span>
          Published {kickoffDay(prediction.published_at)}
        </p>
      </div>

      <div className="card mt-5 flex items-center justify-between gap-4 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">Result</p>
          <p className="mt-2 text-sm text-ink-muted">
            {settled
              ? `Final score ${prediction.actual_home_goals}-${prediction.actual_away_goals}`
              : "Awaiting settlement"}
          </p>
        </div>
        <Badge tone={tone}>{prediction.result?.toUpperCase() ?? "PENDING"}</Badge>
      </div>
    </div>
  );
}
