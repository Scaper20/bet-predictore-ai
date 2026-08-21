/**
 * Turns a real fixture into a prediction.
 *
 * The pipeline is: pull completed matches for the competition, fit team
 * ratings, project the two scoring rates for this fixture, expand them into a
 * scoreline distribution, then read every market off that one distribution.
 * Because all markets come from the same grid they are mutually consistent —
 * the over/under numbers can never contradict the correct-score numbers.
 */

import type { Match, ResultRow } from "@/lib/types";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import {
  AH_LINES, deriveAsianHandicap, deriveMarkets, outcomeEntropy, scoreMatrix,
  type AsianHandicapLine, type MarketProbabilities,
} from "./poisson";
import { expectedRates, fitLeague, normaliseKey, type LeagueFit, type TeamRating } from "./fit";
import { fairOdds } from "./odds";

export interface FormEntry {
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  home: boolean;
  date: number;
}

export interface TeamForm {
  entries: FormEntry[];
  /** Points from the last N matches, out of 3 * N. */
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Share of matches where both sides scored. */
  bttsRate: number;
  /** Share of matches with 3+ goals. */
  overRate: number;
  cleanSheets: number;
}

export interface H2HSummary {
  meetings: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgGoals: number;
  bttsRate: number;
  recent: ResultRow[];
}

export interface Pick {
  /** Machine-readable market id, e.g. "1x2:home" or "ou:over:2.5". */
  market: string;
  /** Human label for the selection. */
  label: string;
  /** Market group for grouping in the UI. */
  group:
    | "Match Result"
    | "Goals"
    | "Both Teams To Score"
    | "Double Chance"
    | "Correct Score"
    | "Asian Handicap";
  probability: number;
  /** Model's own fair price. */
  fairOdds: number;
  /** 0-100 confidence, blending probability with data quality. */
  confidence: number;
}

export interface Prediction {
  match: Match;
  league: LeagueDef | null;
  markets: MarketProbabilities;
  /** Every tradeable line; see poisson.ts's AsianHandicapLine for the push/mirror semantics. */
  asianHandicap: AsianHandicapLine[];
  /** Every market as a ranked list of selections. */
  picks: Pick[];
  /** The single strongest selection, or null when the data cannot support one. */
  topPick: Pick | null;
  /** Whether there is enough real history to stand behind this prediction. */
  sufficiency: Sufficiency;
  form: { home: TeamForm; away: TeamForm };
  h2h: H2HSummary;
  ratings: { home: TeamRating | null; away: TeamRating | null };
  model: {
    homeAdvantage: number;
    rho: number;
    /** Fitted average-matchup rate; see LeagueFit.baseRate. */
    baseRate: number;
    /** Goals per team per match actually observed in the training sample. */
    observedGoalRate: number;
    matchesUsed: number;
    /** 0-100: how much history backs this particular prediction. */
    dataQuality: number;
    /** Normalised entropy of the 1X2 distribution; high means a coin flip. */
    uncertainty: number;
  };
  generatedAt: string;
}

/** Below this many league matches, a fit is not worth publishing a pick from. */
export const MIN_PUBLISHABLE_MATCHES = 15;
/** Below this, the fit works but deserves a visible caveat. */
export const THIN_SAMPLE = 60;
/** Appearances a club needs before its own rating carries real information. */
export const MIN_TEAM_APPEARANCES = 3;

export type SufficiencyLevel = "good" | "limited" | "insufficient";

export interface Sufficiency {
  level: SufficiencyLevel;
  /** Plain-English reason, shown verbatim in the UI. */
  reason: string;
  /** Whether a headline pick may be published at all. */
  publishable: boolean;
}

/**
 * Decides whether there is enough real history behind a fixture to stand
 * behind a pick.
 *
 * This is the guard that keeps the product honest: a competition we have
 * fifteen results for can still be modelled, but presenting the output as a
 * confident tip would be inventing certainty that the data does not support.
 * In that case the UI shows the numbers with an explicit warning and no
 * headline pick.
 */
export function assessSufficiency(
  matchesUsed: number,
  homePlayed: number,
  awayPlayed: number,
): Sufficiency {
  if (matchesUsed < MIN_PUBLISHABLE_MATCHES) {
    return {
      level: "insufficient",
      reason:
        `Only ${matchesUsed} completed ${matchesUsed === 1 ? "match" : "matches"} available for this competition — ` +
        "not enough history to model this fixture.",
      publishable: false,
    };
  }
  if (homePlayed < MIN_TEAM_APPEARANCES || awayPlayed < MIN_TEAM_APPEARANCES) {
    return {
      level: "insufficient",
      reason:
        "One or both clubs have too few completed matches in the sample for a reliable rating.",
      publishable: false,
    };
  }
  if (matchesUsed < THIN_SAMPLE) {
    return {
      level: "limited",
      reason:
        `Based on ${matchesUsed} completed matches — directionally useful, but a thin sample. ` +
        "Treat the probabilities as indicative.",
      publishable: true,
    };
  }
  return {
    level: "good",
    reason: `Fitted on ${matchesUsed} completed matches.`,
    publishable: true,
  };
}

export function buildPrediction(
  match: Match,
  results: ResultRow[],
  h2hRows: ResultRow[] = [],
): Prediction {
  const league = match.league.code ? leagueByCode(match.league.code) ?? null : null;
  const fit = fitLeague(results);
  const { lambda, mu, homeRating, awayRating } = expectedRates(
    fit, match.home.name, match.away.name,
  );

  const grid = scoreMatrix(lambda, mu, fit.rho);
  const markets = deriveMarkets(grid, lambda, mu);
  const asianHandicap = deriveAsianHandicap(grid);

  const form = {
    home: teamForm(results, match.home.name),
    away: teamForm(results, match.away.name),
  };
  const h2h = summariseH2H(h2hRows, match.home.name);

  const dataQuality = scoreDataQuality(fit, homeRating, awayRating);
  const uncertainty = outcomeEntropy(markets.home, markets.draw, markets.away);

  const picks = rankPicks(markets, asianHandicap, dataQuality, uncertainty);
  const sufficiency = assessSufficiency(
    fit.matchesUsed,
    homeRating?.played ?? 0,
    awayRating?.played ?? 0,
  );

  return {
    match,
    league,
    markets,
    asianHandicap,
    picks,
    // A pick is only surfaced when the history behind it justifies one.
    topPick: sufficiency.publishable ? picks[0] ?? null : null,
    sufficiency,
    form,
    h2h,
    ratings: { home: homeRating ?? null, away: awayRating ?? null },
    model: {
      homeAdvantage: fit.homeAdvantage,
      rho: fit.rho,
      baseRate: fit.baseRate,
      observedGoalRate: fit.observedGoalRate,
      matchesUsed: fit.matchesUsed,
      dataQuality,
      uncertainty,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Confidence blends two different things: how likely the selection is, and how
 * much evidence sits behind it. A 70% probability off six matches of history
 * should not read the same as a 70% probability off two full seasons.
 */
function confidenceFor(probability: number, dataQuality: number, uncertainty: number): number {
  // Probability contributes most, but is discounted when the 1X2 spread is
  // near-uniform and when the underlying sample is thin.
  const evidence = 0.55 + 0.45 * (dataQuality / 100);
  const decisiveness = 1 - 0.25 * uncertainty;
  return clampPct(probability * 100 * evidence * decisiveness);
}

function scoreDataQuality(
  fit: LeagueFit,
  home: TeamRating | undefined,
  away: TeamRating | undefined,
): number {
  if (fit.matchesUsed === 0) return 0;
  // League-level evidence saturates around 200 matches.
  const leagueScore = Math.min(1, fit.matchesUsed / 200);
  // Club-level evidence saturates around 12 matches each.
  const homeScore = Math.min(1, (home?.played ?? 0) / 12);
  const awayScore = Math.min(1, (away?.played ?? 0) / 12);
  return clampPct(100 * (0.4 * leagueScore + 0.3 * homeScore + 0.3 * awayScore));
}

function rankPicks(
  m: MarketProbabilities,
  ah: AsianHandicapLine[],
  dataQuality: number,
  uncertainty: number,
): Pick[] {
  const mk = (
    market: string,
    label: string,
    group: Pick["group"],
    probability: number,
  ): Pick => ({
    market,
    label,
    group,
    probability,
    fairOdds: fairOdds(probability),
    confidence: confidenceFor(probability, dataQuality, uncertainty),
  });

  const picks: Pick[] = [
    mk("1x2:home", "Home Win", "Match Result", m.home),
    mk("1x2:draw", "Draw", "Match Result", m.draw),
    mk("1x2:away", "Away Win", "Match Result", m.away),
    mk("dc:home-draw", "Home or Draw (1X)", "Double Chance", m.doubleChance.homeOrDraw),
    mk("dc:away-draw", "Away or Draw (X2)", "Double Chance", m.doubleChance.awayOrDraw),
    mk("dc:home-away", "Home or Away (12)", "Double Chance", m.doubleChance.homeOrAway),
    mk("btts:yes", "Both Teams To Score", "Both Teams To Score", m.bttsYes),
    mk("btts:no", "Both Teams To Score - No", "Both Teams To Score", m.bttsNo),
  ];

  for (const [line, p] of Object.entries(m.over)) {
    picks.push(mk(`ou:over:${line}`, `Over ${line} Goals`, "Goals", p));
    picks.push(mk(`ou:under:${line}`, `Under ${line} Goals`, "Goals", m.under[line]));
  }

  for (const s of m.correctScore.slice(0, 5)) {
    picks.push(
      mk(`cs:${s.home}-${s.away}`, `Correct Score ${s.home}-${s.away}`, "Correct Score", s.probability),
    );
  }

  for (const line of ah) {
    picks.push(mk(`ah:home:${line.line}`, `Home ${formatLine(line.line)}`, "Asian Handicap", line.home));
    picks.push(mk(`ah:away:${-line.line}`, `Away ${formatLine(-line.line)}`, "Asian Handicap", line.away));
  }

  /*
   * Ranking deliberately does not just sort by probability: "Over 0.5 goals" is
   * ~95% likely in every match and would win every time while being worthless
   * as a tip. Selections are scored on how far they sit above a market-typical
   * baseline, so a genuinely strong read beats a trivially safe one.
   */
  return picks
    .map((p) => ({ p, score: pickScore(p) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

/** Baseline probabilities a punter would expect without any model at all. */
const BASELINE: Record<string, number> = {
  "1x2:home": 0.44, "1x2:draw": 0.26, "1x2:away": 0.3,
  "dc:home-draw": 0.7, "dc:away-draw": 0.56, "dc:home-away": 0.74,
  "btts:yes": 0.52, "btts:no": 0.48,
  "ou:over:0.5": 0.93, "ou:under:0.5": 0.07,
  "ou:over:1.5": 0.75, "ou:under:1.5": 0.25,
  "ou:over:2.5": 0.52, "ou:under:2.5": 0.48,
  "ou:over:3.5": 0.3, "ou:under:3.5": 0.7,
  "ou:over:4.5": 0.15, "ou:under:4.5": 0.85,
};

function pickScore(p: Pick): number {
  // Handicap lines are constructed to sit near 50/50 by design (that's the
  // point of a handicap), so "edge over a baseline" isn't a meaningful
  // concept the way it is for 1X2/O-U — a line just shy of 50/50 isn't a
  // stronger read than one further off it. Kept out of the headline-pick
  // race entirely; the Asian Handicap panel reads prediction.asianHandicap
  // directly rather than relying on ranking here.
  if (p.group === "Asian Handicap") return -1;

  const baseline = BASELINE[p.market] ?? (p.group === "Correct Score" ? 0.09 : 0.5);
  // Edge over baseline, weighted by how confidently the model holds it.
  const edge = p.probability - baseline;
  // Very long shots are excluded from the headline pick however big the edge.
  if (p.probability < 0.35) return edge * 0.15;
  return edge * (0.6 + 0.4 * (p.probability - 0.35));
}

function formatLine(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

export function teamForm(results: ResultRow[], teamName: string, limit = 6): TeamForm {
  const key = normaliseKey(teamName);
  const matches = results
    .filter((r) => normaliseKey(r.homeName) === key || normaliseKey(r.awayName) === key)
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);

  const entries: FormEntry[] = matches.map((r) => {
    const isHome = normaliseKey(r.homeName) === key;
    const gf = isHome ? r.homeGoals : r.awayGoals;
    const ga = isHome ? r.awayGoals : r.homeGoals;
    return {
      opponent: isHome ? r.awayName : r.homeName,
      goalsFor: gf,
      goalsAgainst: ga,
      result: gf > ga ? "W" : gf === ga ? "D" : "L",
      home: isHome,
      date: r.date,
    };
  });

  const played = entries.length || 1;
  return {
    entries,
    points: entries.reduce((a, e) => a + (e.result === "W" ? 3 : e.result === "D" ? 1 : 0), 0),
    goalsFor: entries.reduce((a, e) => a + e.goalsFor, 0),
    goalsAgainst: entries.reduce((a, e) => a + e.goalsAgainst, 0),
    bttsRate: entries.filter((e) => e.goalsFor > 0 && e.goalsAgainst > 0).length / played,
    overRate: entries.filter((e) => e.goalsFor + e.goalsAgainst > 2.5).length / played,
    cleanSheets: entries.filter((e) => e.goalsAgainst === 0).length,
  };
}

export function summariseH2H(rows: ResultRow[], homeTeamName: string): H2HSummary {
  const key = normaliseKey(homeTeamName);
  const recent = rows.slice(0, 10);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let goals = 0;
  let btts = 0;

  for (const r of recent) {
    // Orient every meeting from the perspective of this fixture's home side,
    // since the venue swaps between meetings.
    const thisTeamWasHome = normaliseKey(r.homeName) === key;
    const ours = thisTeamWasHome ? r.homeGoals : r.awayGoals;
    const theirs = thisTeamWasHome ? r.awayGoals : r.homeGoals;

    if (ours > theirs) homeWins++;
    else if (ours === theirs) draws++;
    else awayWins++;

    goals += r.homeGoals + r.awayGoals;
    if (r.homeGoals > 0 && r.awayGoals > 0) btts++;
  }

  const n = recent.length || 1;
  return {
    meetings: recent.length,
    homeWins,
    draws,
    awayWins,
    avgGoals: goals / n,
    bttsRate: btts / n,
    recent,
  };
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}
