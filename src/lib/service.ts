/**
 * Application service layer.
 *
 * Server components and route handlers both go through here so that caching,
 * provider selection and the model pipeline stay in one place.
 */

import "server-only";
import type { Match } from "@/lib/types";
import {
  getLive, getMatch, getTrainingResults, getH2H, getUpcoming,
  providerHealth, hasFullCoverage,
} from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { writeAnalysis, aiEnabled, type Analysis } from "@/lib/ai/analyst";

export interface FixtureFeed {
  matches: Match[];
  updatedAt: string;
  coverage: { full: boolean; providers: ReturnType<typeof providerHealth> };
}

function feed(matches: Match[]): FixtureFeed {
  return {
    matches,
    updatedAt: new Date().toISOString(),
    coverage: { full: hasFullCoverage(), providers: providerHealth() },
  };
}

export async function liveFeed(): Promise<FixtureFeed> {
  return feed(await getLive());
}

export async function upcomingFeed(days = 7, league?: string): Promise<FixtureFeed> {
  return feed(await getUpcoming(days, league));
}

export interface MatchDetail {
  match: Match;
  prediction: Prediction;
  analysis: Analysis;
  trainedOn: { leagueName: string; curated: boolean; rows: number };
}

export async function matchDetail(id: string): Promise<MatchDetail | null> {
  const match = await getMatch(id);
  if (!match) return null;

  const [training, h2h] = await Promise.all([getTrainingResults(match), getH2H(match)]);
  const prediction = buildPrediction(match, training.rows, h2h);
  const analysis = await writeAnalysis(prediction);

  return {
    match,
    prediction,
    analysis,
    trainedOn: {
      leagueName: training.leagueName,
      curated: training.curated,
      rows: training.rows.length,
    },
  };
}

/**
 * Predictions for a batch of fixtures.
 *
 * Fixtures in the same competition share one fitted model, so results are
 * grouped by league before fitting rather than refitting per match.
 */
export async function predictBatch(matches: Match[], limit = 12): Promise<Prediction[]> {
  const slice = matches.slice(0, limit);
  const byLeague = new Map<string, Match[]>();
  for (const m of slice) {
    const key = m.league.code ?? `raw:${m.league.id}`;
    const list = byLeague.get(key);
    if (list) list.push(m);
    else byLeague.set(key, [m]);
  }

  const out: Prediction[] = [];
  await Promise.all(
    [...byLeague.values()].map(async (group) => {
      // One training fetch per competition, reused across its fixtures.
      const training = await getTrainingResults(group[0]);
      for (const m of group) {
        out.push(buildPrediction(m, training.rows));
      }
    }),
  );

  // Preserve the incoming ordering, which is already sorted for this audience.
  const order = new Map(slice.map((m, i) => [m.id, i]));
  return out.sort((a, b) => (order.get(a.match.id) ?? 0) - (order.get(b.match.id) ?? 0));
}

export interface TrendSnapshot {
  /** Fixtures whose model read diverges most from a naive expectation. */
  standouts: Prediction[];
  /** Aggregate goal expectation across the upcoming slate. */
  avgExpectedGoals: number;
  /** Share of upcoming fixtures the model reads as high scoring. */
  overLeaning: number;
  /** Share where both teams are likely to score. */
  bttsLeaning: number;
  /** Count of fixtures with a publishable pick. */
  publishable: number;
  total: number;
  updatedAt: string;
}

export async function trends(days = 3): Promise<TrendSnapshot> {
  return cached(`trends:${days}`, 10 * 60_000, async () => {
    const { matches } = await upcomingFeed(days);
    const predictions = await predictBatch(matches, 24);
    const usable = predictions.filter((p) => p.sufficiency.publishable);

    const avgExpectedGoals =
      usable.reduce((a, p) => a + p.markets.expectedGoals.total, 0) / (usable.length || 1);
    const overLeaning =
      usable.filter((p) => p.markets.over["2.5"] > 0.55).length / (usable.length || 1);
    const bttsLeaning =
      usable.filter((p) => p.markets.bttsYes > 0.55).length / (usable.length || 1);

    // "Standout" means the model is furthest from a neutral 1X2 spread — the
    // fixtures where it is actually saying something.
    const standouts = [...usable]
      .sort((a, b) => a.model.uncertainty - b.model.uncertainty)
      .slice(0, 6);

    return {
      standouts,
      avgExpectedGoals,
      overLeaning,
      bttsLeaning,
      publishable: usable.length,
      total: predictions.length,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function systemStatus() {
  return {
    providers: providerHealth(),
    fullCoverage: hasFullCoverage(),
    aiAnalyst: aiEnabled(),
  };
}
