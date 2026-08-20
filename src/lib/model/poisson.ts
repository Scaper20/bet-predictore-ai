/**
 * Scoreline distribution maths.
 *
 * Goals in football are close to Poisson, but not quite: low-scoring matches
 * (0-0, 1-0, 0-1, 1-1) occur more often than independent Poisson marginals
 * predict, because teams play differently when the game is tight. Dixon &
 * Coles (1997) handle this with a correction factor on exactly those four
 * scorelines, which is what `tau` below implements.
 */

/** Goals above this are vanishingly rare; the grid is truncated here. */
export const MAX_GOALS = 10;

/** log(n!) via a lookup — the grid only ever needs small factorials. */
const LOG_FACT: number[] = (() => {
  const out = [0];
  for (let i = 1; i <= MAX_GOALS + 1; i++) out.push(out[i - 1] + Math.log(i));
  return out;
})();

export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - LOG_FACT[k]);
}

/**
 * Dixon-Coles dependency correction.
 *
 * `rho` is negative in practice (~-0.05): it lifts the draw-ish low scorelines
 * and trims 1-0/0-1 slightly. Only the four lowest scorelines are touched.
 */
export function tau(
  x: number,
  y: number,
  lambda: number,
  mu: number,
  rho: number,
): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Joint distribution over scorelines as a (MAX_GOALS+1)² matrix.
 * `grid[x][y]` is P(home scores x, away scores y). Rows sum to 1.
 */
export function scoreMatrix(lambda: number, mu: number, rho = 0): number[][] {
  const n = MAX_GOALS + 1;
  const grid: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  const homePmf = Array.from({ length: n }, (_, x) => poissonPmf(x, lambda));
  const awayPmf = Array.from({ length: n }, (_, y) => poissonPmf(y, mu));

  let total = 0;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      // tau can push a cell slightly negative for extreme rho; clamp at 0.
      const p = Math.max(0, homePmf[x] * awayPmf[y] * tau(x, y, lambda, mu, rho));
      grid[x][y] = p;
      total += p;
    }
  }

  // Renormalise: truncation at MAX_GOALS and the tau correction both leak mass.
  if (total > 0) {
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) grid[x][y] /= total;
    }
  }
  return grid;
}

export interface MarketProbabilities {
  home: number;
  draw: number;
  away: number;
  bttsYes: number;
  bttsNo: number;
  /** Keyed by line, e.g. `2.5` → P(total goals > 2.5). */
  over: Record<string, number>;
  under: Record<string, number>;
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
  cleanSheet: { home: number; away: number };
  /** Most likely scorelines, highest probability first. */
  correctScore: { home: number; away: number; probability: number }[];
  /** Expected goals implied by the fitted rates. */
  expectedGoals: { home: number; away: number; total: number };
}

export const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;

export function deriveMarkets(grid: number[][], lambda: number, mu: number): MarketProbabilities {
  const n = grid.length;
  let home = 0;
  let draw = 0;
  let away = 0;
  let bttsYes = 0;
  let homeCleanSheet = 0;
  let awayCleanSheet = 0;

  const totalGoals = new Array<number>(2 * n).fill(0);
  const scores: { home: number; away: number; probability: number }[] = [];

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const p = grid[x][y];
      if (p <= 0) continue;

      if (x > y) home += p;
      else if (x === y) draw += p;
      else away += p;

      if (x > 0 && y > 0) bttsYes += p;
      if (y === 0) homeCleanSheet += p;
      if (x === 0) awayCleanSheet += p;

      totalGoals[x + y] += p;
      scores.push({ home: x, away: y, probability: p });
    }
  }

  const over: Record<string, number> = {};
  const under: Record<string, number> = {};
  for (const line of GOAL_LINES) {
    // Lines are half-goals, so no push case: over = P(total >= ceil(line)).
    const threshold = Math.ceil(line);
    let o = 0;
    for (let g = threshold; g < totalGoals.length; g++) o += totalGoals[g];
    over[String(line)] = o;
    under[String(line)] = 1 - o;
  }

  scores.sort((a, b) => b.probability - a.probability);

  return {
    home,
    draw,
    away,
    bttsYes,
    bttsNo: 1 - bttsYes,
    over,
    under,
    doubleChance: {
      homeOrDraw: home + draw,
      awayOrDraw: away + draw,
      homeOrAway: home + away,
    },
    cleanSheet: { home: homeCleanSheet, away: awayCleanSheet },
    correctScore: scores.slice(0, 12),
    expectedGoals: { home: lambda, away: mu, total: lambda + mu },
  };
}

/** Shannon entropy of the 1X2 distribution, normalised to 0..1. */
export function outcomeEntropy(home: number, draw: number, away: number): number {
  const ps = [home, draw, away].filter((p) => p > 0);
  const h = -ps.reduce((acc, p) => acc + p * Math.log(p), 0);
  return h / Math.log(3);
}
