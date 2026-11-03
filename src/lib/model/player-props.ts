/**
 * Player props: how many goals, shots, tackles... a starting player is likely
 * to record, as a negative binomial count. Pure and shared by the walk-forward
 * backtest (scripts/props-lab.ts) and the live feed (src/lib/props-feed.ts), so
 * what ships is exactly what was scored.
 *
 *   rate      per-90 rate from the player's own games, each weighted by its
 *             minutes and by how recent it is (half-life), shrunk toward the
 *             position's average by k pseudo-90s. Goals and assists blend in
 *             the steadier xG / xA rate.
 *   minutes   expected minutes given a start: recent starts, shrunk to 80.
 *   opponent  how much of this stat the opponent concedes to this position
 *             per 90, relative to the position average, shrunk by oppK
 *             pseudo-90s and clipped.
 *   mean      rate x minutes / 90 x opponent factor
 *   spread    negative binomial size per market and position, fitted on the
 *             backtest's validation window (method of moments).
 *
 * Counts are FotMob's. A bookmaker's own data provider can count tackles,
 * clearances and passes differently.
 */

import { nbPmf } from "./match-stats";

export type PropMarketKey =
  | "goals" | "assists" | "goalsAssists" | "shots" | "shotsOnTarget"
  | "tackles" | "fouls" | "clearances" | "passes" | "saves";

/** FotMob usual position: 0 keeper, 1 defender, 2 midfielder, 3 attacker. */
export type PositionCode = 0 | 1 | 2 | 3;

/** One past appearance, the fields the model reads. */
export interface PropGame {
  t: number;
  min: number;
  started: boolean;
  g: number; a: number; sh: number; sot: number;
  xg: number; xa: number;
  tk: number; cl: number; fc: number; pa: number; sv: number;
}

export interface PropParams {
  /** Days for a game's weight to halve. */
  halfLife: number;
  /** Pseudo-90s of the position average mixed into the player's rate. */
  k: number;
  /** Weight on the xG / xA rate (goals, assists). 0 for other markets. */
  blend: number;
  /** Pseudo-90s of average mixed into the opponent's conceded rate; 0 = no opponent factor. */
  oppK: number;
  /** Negative binomial size by position (Infinity = Poisson). */
  size: Record<PositionCode, number>;
}

export interface PropMarketSpec {
  key: PropMarketKey;
  label: string;
  /** Half-lines step: 1 for counts, 5 for passes. */
  step: number;
  /** Keepers only (saves) or outfield only (everything else). */
  keepers: boolean;
}

export const PROP_SPECS: Record<PropMarketKey, PropMarketSpec> = {
  goals: { key: "goals", label: "Goals", step: 1, keepers: false },
  assists: { key: "assists", label: "Assists", step: 1, keepers: false },
  goalsAssists: { key: "goalsAssists", label: "Goals + assists", step: 1, keepers: false },
  shots: { key: "shots", label: "Shots", step: 1, keepers: false },
  shotsOnTarget: { key: "shotsOnTarget", label: "Shots on target", step: 1, keepers: false },
  tackles: { key: "tackles", label: "Tackles", step: 1, keepers: false },
  fouls: { key: "fouls", label: "Fouls committed", step: 1, keepers: false },
  clearances: { key: "clearances", label: "Clearances", step: 1, keepers: false },
  passes: { key: "passes", label: "Passes attempted", step: 5, keepers: false },
  saves: { key: "saves", label: "Saves", step: 1, keepers: true },
};

export const PROP_MARKETS = Object.keys(PROP_SPECS) as PropMarketKey[];

/** The count a game recorded for a market. */
export function propValue(g: Pick<PropGame, "g" | "a" | "sh" | "sot" | "tk" | "cl" | "fc" | "pa" | "sv">, m: PropMarketKey): number {
  switch (m) {
    case "goals": return g.g;
    case "assists": return g.a;
    case "goalsAssists": return g.g + g.a;
    case "shots": return g.sh;
    case "shotsOnTarget": return g.sot;
    case "tackles": return g.tk;
    case "fouls": return g.fc;
    case "clearances": return g.cl;
    case "passes": return g.pa;
    case "saves": return g.sv;
  }
}

/** Per-90 position averages, the shrinkage targets (plus xG and xA). */
export type PositionPriors = Record<PositionCode, Record<PropMarketKey | "xg" | "xa", number>>;

const DAY = 86_400_000;
/** Appearances shorter than this say little about a per-90 rate. */
const MIN_MINUTES = 15;

function weight(now: number, t: number, halfLife: number): number {
  return Math.pow(0.5, Math.max(0, now - t) / DAY / halfLife);
}

/** The player's per-90 rate for a market at `now`, from games strictly before it. */
export function playerRate(history: PropGame[], m: PropMarketKey, now: number, prior: Record<PropMarketKey | "xg" | "xa", number>, p: PropParams): number {
  if (m === "goalsAssists") {
    return playerRate(history, "goals", now, prior, p) + playerRate(history, "assists", now, prior, p);
  }
  let num = 0, xnum = 0, den = 0;
  for (const g of history) {
    if (g.t >= now || g.min < MIN_MINUTES) continue;
    const w = weight(now, g.t, p.halfLife);
    num += w * propValue(g, m);
    if (m === "goals") xnum += w * g.xg;
    else if (m === "assists") xnum += w * g.xa;
    den += (w * g.min) / 90;
  }
  const base = (num + p.k * prior[m]) / (den + p.k);
  if (p.blend <= 0 || (m !== "goals" && m !== "assists")) return base;
  const xPrior = m === "goals" ? prior.xg : prior.xa;
  const xRate = (xnum + p.k * xPrior) / (den + p.k);
  // xG and goals share a scale only on average; keep the blend on the goals scale.
  const scale = xPrior > 0 ? prior[m] / xPrior : 1;
  return p.blend * xRate * scale + (1 - p.blend) * base;
}

/** Expected minutes if the player starts: the last ten starts, shrunk toward 80. */
export function expectedMinutes(history: PropGame[], now: number): number {
  const starts = history.filter((g) => g.started && g.t < now).sort((a, b) => b.t - a.t).slice(0, 10);
  const sum = starts.reduce((s, g) => s + Math.min(g.min, 95), 0);
  return (sum + 3 * 80) / (starts.length + 3);
}

/** One game's total of a stat that an opponent conceded to one position. */
export interface ConcededGame {
  t: number;
  min: number;
  y: Record<PropMarketKey, number>;
}

/** How much more (>1) or less of this stat the opponent concedes to the position than average. */
export function opponentFactor(conceded: ConcededGame[], m: PropMarketKey, now: number, prior: number, p: PropParams): number {
  if (p.oppK <= 0 || prior <= 0) return 1;
  let num = 0, den = 0;
  for (const c of conceded) {
    if (c.t >= now) continue;
    const w = weight(now, c.t, p.halfLife);
    num += w * c.y[m];
    den += (w * c.min) / 90;
  }
  const rate = (num + p.oppK * prior) / (den + p.oppK);
  return Math.min(1.6, Math.max(0.6, rate / prior));
}

export interface Projection {
  market: PropMarketKey;
  mean: number;
  size: number;
}

export interface ProjectInput {
  market: PropMarketKey;
  position: PositionCode;
  history: PropGame[];
  conceded: ConcededGame[];
  now: number;
  priors: PositionPriors;
  params: PropParams;
  /** Expected minutes if known (e.g. a late sub plan); defaults to the player's starts. */
  minutes?: number;
}

/** Mean and spread for a starting player in one market, or null when the market does not apply. */
export function project(i: ProjectInput): Projection | null {
  const spec = PROP_SPECS[i.market];
  if (spec.keepers !== (i.position === 0)) return null;
  const prior = i.priors[i.position];
  const rate = playerRate(i.history, i.market, i.now, prior, i.params);
  const mins = i.minutes ?? expectedMinutes(i.history, i.now);
  const opp = i.market === "goalsAssists"
    ? (opponentFactor(i.conceded, "goals", i.now, prior.goals, i.params) * prior.goals +
        opponentFactor(i.conceded, "assists", i.now, prior.assists, i.params) * prior.assists) /
      Math.max(1e-9, prior.goals + prior.assists)
    : opponentFactor(i.conceded, i.market, i.now, prior[i.market], i.params);
  return { market: i.market, mean: Math.max(0.001, (rate * mins) / 90 * opp), size: i.params.size[i.position] };
}

/** P(X > line) for a half-line under NB(mean, size). */
export function overProb(mean: number, size: number, line: number): number {
  const k = Math.floor(line);
  if (k < 0) return 1;
  const pmf = nbPmf(mean, size, k);
  let cdf = 0;
  for (const v of pmf) cdf += v;
  return Math.min(1, Math.max(0, 1 - cdf));
}

/** Log probability of an observed count (the backtest's main score). */
export function logScore(mean: number, size: number, y: number): number {
  const pmf = nbPmf(mean, size, y);
  return Math.log(Math.max(1e-12, pmf[y]));
}

export interface LadderLine {
  line: number;
  over: number;
  under: number;
}

/**
 * The line nearest 50/50 and `each` lines either side of it (never below 0.5),
 * each with the probability of over and under.
 */
export function propLadder(mean: number, size: number, market: PropMarketKey, each = 3): LadderLine[] {
  const step = PROP_SPECS[market].step;
  // Find the half-line whose over probability is closest to one half.
  let centre = 0.5;
  let best = Infinity;
  for (let line = 0.5; line <= Math.max(10, mean * 3 + 10); line += step === 1 ? 1 : step) {
    const d = Math.abs(overProb(mean, size, line) - 0.5);
    if (d < best) {
      best = d;
      centre = line;
    }
  }
  const out: LadderLine[] = [];
  for (let i = -each; i <= each; i++) {
    const line = centre + i * step;
    if (line < 0.5) continue;
    const over = overProb(mean, size, line);
    out.push({ line, over, under: 1 - over });
  }
  return out;
}

/** Logit scaling fitted on the backtest's validation window (a < 1 pulls toward 50%). */
export function calibrate(p: number, a: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  const z = a * Math.log(q / (1 - q));
  return 1 / (1 + Math.exp(-z));
}
