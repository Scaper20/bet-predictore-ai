/**
 * Application service layer.
 *
 * Server components and route handlers both go through here so that caching,
 * provider selection and the model pipeline stay in one place.
 */

import "server-only";
import type { Match, ResultRow } from "@/lib/types";
import {
  getLive, getMatch, getTrainingResults, getH2H, getUpcoming,
  providerHealth, hasFullCoverage,
} from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { buildPrediction, type Prediction } from "@/lib/model/predict";
import { after } from "next/server";
import { archivedResults, storeResults } from "@/lib/archive/history-store";
import { normaliseKey } from "@/lib/model/fit";
import { scoreMatrix, deriveLiveWinProbability } from "@/lib/model/poisson";
import { writeAnalysis, aiEnabled, type Analysis } from "@/lib/ai/analyst";
import { isLive } from "@/lib/format";
import { internationalPool, leagueByCode } from "@/lib/leagues";
import { sportOrDefault } from "@/lib/sports";
import { selectFeatured, shortlist, type FeaturedMatch } from "@/lib/featured";
import { canonicaliseRows, nameBook, nameScope } from "@/lib/teams/canonical";

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

/**
 * Completed matches to fit this fixture's competition on.
 *
 * Prefers the stored archive over the live feeds, which is a correction rather
 * than an optimisation. Measured through getTrainingResults() alone, every
 * competition in the catalogue was training on 15-35 matches: TheSportsDB's
 * public key truncates a season to about fifteen rows, and the two richer
 * adapters have no key configured. Capping the backtest's training window to
 * that depth puts the model at 51.6% accuracy while it claims 74.5%, against
 * 66.3% claiming 67.3% on full history — so the thin sample was costing about
 * fifteen points of accuracy and twenty-three points of honesty.
 *
 * The archive is filled by scripts/backfill-history.ts and holds thousands of
 * rows per competition. It is preferred outright rather than merged: the live
 * feeds cannot add anything it lacks except the last day or two, and merging
 * two sources of the same fixture risks double-weighting it in the fit. The
 * live path stays as the fallback for competitions not yet backfilled, and for
 * any deployment with no Supabase configured at all.
 */
async function trainingRows(
  match: Match,
): Promise<{ rows: ResultRow[]; leagueName: string; curated: boolean }> {
  const code = match.league.code;
  if (!code) return getTrainingResults(match);

  const def = leagueByCode(code);
  const raw = def?.confederation ? await pooledArchive(def) : await archivedResults(code).catch(() => []);
  // The archive spells clubs the way each source does ("Leeds", "Nott'm
  // Forest"); the fixture uses the canonical name. Linked here, or a club
  // with years of history fits on none of it.
  const scope = def ? nameScope(def) : null;
  const archived = scope ? canonicaliseRows(raw, await nameBook(scope)) : raw;
  // Deep enough to stand on its own; refreshed nightly (archive/refresh.ts).
  if (archived.length >= RICH_ARCHIVE) {
    const leagueName = def?.confederation
      ? `${match.league.name} (rated on all ${def.confederation === "global" ? "national-team" : `${def.confederation} and global`} internationals)`
      : match.league.name;
    return { rows: archived, leagueName, curated: true };
  }

  /*
   * A thin archive: NPFL, the CAF and UEFA cups, anything football-data.co.uk
   * does not carry. The live feeds only ever show the last 15-35 results, and
   * winrate is driven by depth far more than by anything in the model —
   * walk-forward, about 52% of picks land on 35 matches of history against 74%
   * on 400. So every result the feeds show is kept, and the history these
   * competitions train on grows every week instead of staying a window.
   */
  const live = await getTrainingResults(match);
  const pooled = Boolean(leagueByCode(code)?.confederation);
  if (live.curated && !pooled && live.rows.length > 0) {
    keepResults(code, live.rows);
  }
  const merged = mergeResults(archived, live.rows);
  return merged.length > live.rows.length
    ? { rows: merged, leagueName: live.leagueName, curated: true }
    : live;
}

/**
 * The archive for a national-team competition, pooled the way the live path
 * pools it (getTrainingResults -> internationalPool): every competition in the
 * confederation plus the global ones. National sides play too few games in
 * any one competition to be rated on it alone; without this, an AFCON
 * qualifier with a deep archive of its own would train on qualifiers only and
 * ignore the same teams' friendlies, finals and World Cup qualifiers.
 */
async function pooledArchive(def: NonNullable<ReturnType<typeof leagueByCode>>): Promise<ResultRow[]> {
  const pool = internationalPool(def);
  const parts = await Promise.all(pool.map((l) => archivedResults(l.code).catch(() => [] as ResultRow[])));
  return parts.reduce((acc, rows) => mergeResults(acc, rows), [] as ResultRow[]);
}

/** Archive depth past which the live feeds add nothing worth a request. */
const RICH_ARCHIVE = 300;

function keepResults(code: string, rows: ResultRow[]): void {
  const archiveRows = rows.map((r) => ({
    leagueCode: code,
    kickoff: r.date,
    homeName: r.homeName,
    awayName: r.awayName,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
  }));
  const write = () => storeResults(archiveRows, "live-feed").catch(() => 0);
  try {
    // After the response, so a page never waits on an archive write.
    after(write);
  } catch {
    // Outside a request (scripts, tests): just fire it.
    void write();
  }
}

/** Archive plus live rows, one row per fixture. */
function mergeResults(a: ResultRow[], b: ResultRow[]): ResultRow[] {
  const key = (r: ResultRow) =>
    `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseKey(r.homeName)}|${normaliseKey(r.awayName)}`;
  const out = new Map<string, ResultRow>();
  for (const r of [...a, ...b]) if (!out.has(key(r))) out.set(key(r), r);
  return [...out.values()].sort((x, y) => x.date - y.date);
}

export async function matchDetail(id: string): Promise<MatchDetail | null> {
  const match = await getMatch(id);
  if (!match) return null;

  const [training, h2h] = await Promise.all([trainingRows(match), getH2H(match)]);
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
 * The fitted prediction for one fixture, without the written analysis.
 *
 * For Ask BetriX (lib/ask/tools.ts), which reads the numbers and writes its
 * own answer: going through matchDetail() would pay for a second model call
 * (writeAnalysis) on every question about a fixture. Cached briefly, since a
 * conversation tends to ask about the same match several times in a row.
 */
export async function matchPrediction(id: string): Promise<Prediction | null> {
  return cached(`prediction:${id}`, 10 * 60_000, async () => {
    const match = await getMatch(id);
    if (!match) return null;
    const [training, h2h] = await Promise.all([trainingRows(match), getH2H(match)]);
    return buildPrediction(match, training.rows, h2h);
  });
}

export interface LiveProbability {
  home: number;
  draw: number;
  away: number;
  currentScore: { home: number; away: number };
  elapsedMinutes: number;
  /** Same meaning as Prediction.sufficiency.publishable — thin-sample fixtures still compute, but the UI should caveat them the same way it already does pre-match. */
  publishable: boolean;
}

/**
 * A live match's elapsed minutes, clamped for the projection below.
 *
 * Provider feeds report `minute` inconsistently at halftime (some carry the
 * last first-half value, some null it out, some send a non-numeric status
 * string upstream that never survives to this typed field) — rather than
 * depend on any one provider's exact behaviour there, halftime is always
 * treated as exactly 45 elapsed. `?? 45` (not `|| 45`) matters: a genuine
 * 1st-minute match has `minute: 0`, which is falsy but a real, very-early
 * elapsed time, not an unknown one (see statusLabel() in format.ts for a
 * harmless instance of this same mistake in a display-only context — it
 * isn't harmless here). Extra time is clamped to "no regular time left,"
 * a reasonable approximation given the model has no ET-specific dynamics.
 */
function elapsedMinutesFor(match: Match): number {
  // Period/regulation length come from the sport descriptor rather than
  // literal 45/90, so a second sport doesn't silently inherit football's clock.
  const sport = sportOrDefault(leagueByCode(match.league.code ?? "")?.sport);
  if (match.status === "halftime") return sport.periodMinutes;
  return Math.min(
    sport.regulationMinutes,
    Math.max(0, match.minute ?? sport.periodMinutes),
  );
}

/**
 * Final-result probability for a match currently in progress, projected
 * from the same fitted rates used for its pre-match prediction, scaled down
 * to however much time is left and combined with the current score.
 *
 * VIP-only — see api/match/[id]/live-probability/route.ts for the
 * entitlement check, which happens there, not here, so this stays a plain
 * data function.
 */
export async function liveWinProbability(matchId: string): Promise<LiveProbability | null> {
  const match = await getMatch(matchId);
  if (!match || !isLive(match)) return null;

  const training = await trainingRows(match);
  const prediction = buildPrediction(match, training.rows);
  const { home: lambda, away: mu } = prediction.markets.expectedGoals;

  const elapsedMinutes = elapsedMinutesFor(match);
  const remainingFraction = Math.max(0, (90 - elapsedMinutes) / 90);
  const remainingGrid = scoreMatrix(lambda * remainingFraction, mu * remainingFraction, prediction.model.rho);

  const result = deriveLiveWinProbability(remainingGrid, match.score.home ?? 0, match.score.away ?? 0);

  return {
    ...result,
    currentScore: { home: match.score.home ?? 0, away: match.score.away ?? 0 },
    elapsedMinutes,
    publishable: prediction.sufficiency.publishable,
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
      const training = await trainingRows(group[0]);
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

/**
 * The single strongest publishable pick across the near-term slate.
 *
 * Public, free, no login — a deliberate growth/trust hook: one real,
 * shareable headline pick out in the open, while the rest of the slate's
 * depth (value detection, Kelly sizing, Asian handicap) stays behind the
 * paid gates. Cached slate-wide (not per-user, so this is a normal fit for
 * the shared provider cache, unlike entitlement reads).
 */
export async function bestBetOfDay(): Promise<Prediction | null> {
  return cached("best-bet-of-day", 30 * 60_000, async () => {
    const { matches } = await upcomingFeed(2);
    const predictions = await predictBatch(matches, 30);
    const candidates = predictions.filter((p) => p.sufficiency.publishable && p.topPick);
    if (candidates.length === 0) return null;

    const ranked = [...candidates].sort(
      (a, b) => (b.topPick?.confidence ?? 0) - (a.topPick?.confidence ?? 0),
    );
    return ranked[0];
  });
}

/**
 * The homepage's featured board.
 *
 * Cached for five minutes rather than the thirty bestBetOfDay uses, because
 * this board carries live fixtures: a half-hour-old "Live now" row with a
 * stale scoreline is worse than no board at all. Five minutes is still long
 * enough that the shortlist's per-league training fetches are shared across
 * effectively every visitor.
 *
 * The SELECTION is what gets cached here, deliberately. Scores are patched on
 * the client from /api/live, so the four fixtures stay put while the numbers
 * move — re-ranking every thirty seconds would pull a match out from under
 * someone mid-click.
 */
export async function featuredFeed(slots = 4): Promise<FeaturedMatch[]> {
  return cached(`featured:${slots}`, 5 * 60_000, async () => {
    const [live, upcoming] = await Promise.all([
      getLive().catch(() => []),
      getUpcoming(3).catch(() => []),
    ]);

    const now = Date.now();
    const seen = new Set<string>();
    const pool = [...live, ...upcoming].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Shortlist BEFORE predicting: predictBatch fetches training once per
    // distinct competition, so the cost of this board is measured in leagues,
    // not fixtures.
    const candidates = shortlist(pool, now);
    if (candidates.length === 0) return [];

    const predictions = await predictBatch(candidates, candidates.length);
    return selectFeatured(
      predictions.map((prediction) => ({ prediction })),
      { now, slots },
    );
  });
}

export function systemStatus() {
  return {
    providers: providerHealth(),
    fullCoverage: hasFullCoverage(),
    aiAnalyst: aiEnabled(),
  };
}
