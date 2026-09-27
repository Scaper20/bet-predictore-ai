/**
 * Scoring for a walk-forward backtest.
 *
 * Pure, and separate from the runner (scripts/backtest.ts) for the reason the
 * rest of this repo splits that way: the runner does network I/O, this needs
 * unit tests.
 *
 * The distinction that matters here is between a hit rate and a result. A hit
 * rate answers "how often was the selection right", which is the question the
 * product gets asked; whether a selection was worth making is a different
 * question, and 1.10 shots that land 88% of the time answer the first one
 * beautifully while losing money. So every summary below carries the realised
 * rate, the probability the model claimed, and — wherever a real closing price
 * existed — the return. A replacement model has to win on all three.
 */

export type PickOutcome = "win" | "lose" | "push";

export interface BacktestEntry {
  /** Machine market id, e.g. "1x2:home". */
  market: string;
  /** Competition slug, for the per-league split. */
  league: string;
  /** The model's claimed probability for this selection. */
  probability: number;
  outcome: PickOutcome;
  /**
   * Decimal price actually available at the close, when the source carries one
   * for this market. Absent for markets the dataset does not price (double
   * chance, correct score), which is why coverage is reported alongside the
   * return rather than the return being quoted on its own.
   */
  price?: number;
  /**
   * The market's own probability for the same selection, vig removed. The
   * benchmark that matters: beating a coin flip is easy, beating the closing
   * line is the whole game.
   */
  marketProbability?: number;
}

export interface RateSummary {
  n: number;
  wins: number;
  losses: number;
  pushes: number;
  /** Pushes excluded, as everywhere else in this codebase. */
  hitRate: number | null;
  /** Mean probability the model claimed across these selections. */
  claimed: number;
  /**
   * Realised minus claimed, in percentage points. Negative means the model
   * says it is right more often than it is.
   */
  gap: number | null;
}

export interface ReturnSummary {
  /** Selections that had a price attached. */
  priced: number;
  /** Total staked, at one unit per selection. */
  staked: number;
  /** Profit in units. */
  profit: number;
  /** profit / staked. */
  roi: number | null;
}

export interface CalibrationBin {
  /** Lower edge, e.g. 0.6 for the 60-70% band. */
  from: number;
  to: number;
  n: number;
  claimed: number;
  realised: number | null;
}

export interface BacktestSummary {
  overall: RateSummary;
  byMarketFamily: Map<string, RateSummary>;
  byMarket: Map<string, RateSummary>;
  byLeague: Map<string, RateSummary>;
  calibration: CalibrationBin[];
  /**
   * Mean squared error of the claimed probability against the outcome. Lower
   * is better; saying 50% to everything scores 0.25. Unlike a hit rate this
   * cannot be gamed by only ever selecting near-certainties.
   */
  brier: number | null;
  /** Sample-weighted mean |realised - claimed| across populated bins. */
  expectedCalibrationError: number | null;
  returnAtClose: ReturnSummary;
  /** The same selections, scored against what the closing line said about them. */
  marketBenchmark: {
    n: number;
    /** Mean probability the market gave the model's own selection. */
    marketClaimed: number;
    /** Mean probability the model gave it. */
    modelClaimed: number;
    marketBrier: number | null;
    modelBrier: number | null;
  };
}

function emptyRate(): RateSummary {
  return { n: 0, wins: 0, losses: 0, pushes: 0, hitRate: null, claimed: 0, gap: null };
}

function rate(entries: BacktestEntry[]): RateSummary {
  if (entries.length === 0) return emptyRate();
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let claimed = 0;
  for (const e of entries) {
    if (e.outcome === "win") wins++;
    else if (e.outcome === "lose") losses++;
    else pushes++;
    claimed += e.probability;
  }
  const graded = wins + losses;
  const hitRate = graded > 0 ? wins / graded : null;
  const meanClaimed = claimed / entries.length;
  return {
    n: entries.length,
    wins,
    losses,
    pushes,
    hitRate,
    claimed: meanClaimed,
    gap: hitRate === null ? null : (hitRate - meanClaimed) * 100,
  };
}

function group(
  entries: BacktestEntry[],
  key: (e: BacktestEntry) => string,
): Map<string, RateSummary> {
  const buckets = new Map<string, BacktestEntry[]>();
  for (const e of entries) {
    const k = key(e);
    const list = buckets.get(k);
    if (list) list.push(e);
    else buckets.set(k, [e]);
  }
  const out = new Map<string, RateSummary>();
  // Biggest sample first: the order in which a reader should trust the rows.
  for (const [k, list] of [...buckets].sort((a, b) => b[1].length - a[1].length)) {
    out.set(k, rate(list));
  }
  return out;
}

/** The part of a market id before the first ":", matching predictions_log. */
export function marketFamily(market: string): string {
  return market.split(":")[0];
}

function brierScore(
  entries: BacktestEntry[],
  probability: (e: BacktestEntry) => number | undefined,
): number | null {
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    // A push is a void bet, not a half-right forecast; it says nothing about
    // whether the probability was any good.
    if (e.outcome === "push") continue;
    const p = probability(e);
    if (p === undefined) continue;
    const actual = e.outcome === "win" ? 1 : 0;
    sum += (p - actual) ** 2;
    n++;
  }
  return n > 0 ? sum / n : null;
}

export function calibration(entries: BacktestEntry[], bins = 10): CalibrationBin[] {
  const graded = entries.filter((e) => e.outcome !== "push");
  const out: CalibrationBin[] = [];
  for (let i = 0; i < bins; i++) {
    const from = i / bins;
    const to = (i + 1) / bins;
    const inBin = graded.filter((e) =>
      i === bins - 1 ? e.probability >= from : e.probability >= from && e.probability < to,
    );
    if (inBin.length === 0) continue;
    const wins = inBin.filter((e) => e.outcome === "win").length;
    out.push({
      from,
      to,
      n: inBin.length,
      claimed: inBin.reduce((a, e) => a + e.probability, 0) / inBin.length,
      realised: wins / inBin.length,
    });
  }
  return out;
}

/**
 * Flat-stake return at the prices that were actually available.
 *
 * One unit per selection, settled at the decimal price. A push returns the
 * stake, so it contributes to neither profit nor loss while still counting as
 * staked — which is exactly what a void bet does to a bankroll.
 */
export function returnAtClose(entries: BacktestEntry[]): ReturnSummary {
  let staked = 0;
  let profit = 0;
  let priced = 0;
  for (const e of entries) {
    if (e.price === undefined || !Number.isFinite(e.price) || e.price <= 1) continue;
    priced++;
    staked += 1;
    if (e.outcome === "win") profit += e.price - 1;
    else if (e.outcome === "lose") profit -= 1;
  }
  return { priced, staked, profit, roi: staked > 0 ? profit / staked : null };
}

export function summarise(entries: BacktestEntry[]): BacktestSummary {
  const cal = calibration(entries);
  const withMarket = entries.filter((e) => e.marketProbability !== undefined);

  const binned = cal.reduce((a, b) => a + b.n, 0);
  const ece =
    binned > 0
      ? cal.reduce((a, b) => a + Math.abs((b.realised ?? 0) - b.claimed) * b.n, 0) / binned
      : null;

  return {
    overall: rate(entries),
    byMarketFamily: group(entries, (e) => marketFamily(e.market)),
    byMarket: group(entries, (e) => e.market),
    byLeague: group(entries, (e) => e.league),
    calibration: cal,
    brier: brierScore(entries, (e) => e.probability),
    expectedCalibrationError: ece,
    returnAtClose: returnAtClose(entries),
    marketBenchmark: {
      n: withMarket.length,
      marketClaimed:
        withMarket.length > 0
          ? withMarket.reduce((a, e) => a + (e.marketProbability ?? 0), 0) / withMarket.length
          : 0,
      modelClaimed:
        withMarket.length > 0
          ? withMarket.reduce((a, e) => a + e.probability, 0) / withMarket.length
          : 0,
      marketBrier: brierScore(withMarket, (e) => e.marketProbability),
      modelBrier: brierScore(withMarket, (e) => e.probability),
    },
  };
}

/**
 * Strips the bookmaker's margin from prices for mutually exclusive,
 * collectively exhaustive outcomes.
 *
 * Proportional normalisation: divide each implied probability by their sum.
 * It is the standard first approximation and it is not exactly right — real
 * margin sits disproportionately on the longshot — but the alternatives (Shin,
 * power) need an optimiser for a correction smaller than the sampling noise at
 * these volumes.
 */
export function deVig(prices: number[]): number[] {
  const implied = prices.map((p) => (p > 1 ? 1 / p : 0));
  const total = implied.reduce((a, b) => a + b, 0);
  if (total <= 0) return prices.map(() => 0);
  return implied.map((p) => p / total);
}
