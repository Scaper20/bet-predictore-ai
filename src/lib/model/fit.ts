/**
 * Fits team attack/defence ratings by weighted maximum likelihood.
 *
 * For a match between home i and away j:
 *   lambda = exp(attack_i - defence_j + homeAdvantage)
 *   mu     = exp(attack_j - defence_i)
 *
 * The log-likelihood of a Poisson GLM with a log link is concave, and the L2
 * penalty makes it strictly concave, so plain gradient ascent reaches the
 * unique global optimum — no need for a heavyweight optimiser.
 *
 * Two details matter for football specifically:
 *  - Recent matches are weighted more heavily (exponential decay in days),
 *    because squads and form drift over a season.
 *  - The penalty shrinks sparsely-observed teams toward league average, which
 *    is what stops a newly promoted side with three games played from being
 *    handed an extreme rating.
 */

import type { ResultRow } from "@/lib/types";
import { scoreMatrix, tau } from "./poisson";

export interface TeamRating {
  id: string;
  name: string;
  /** Positive means scores more than league average. */
  attack: number;
  /** Positive means concedes fewer than league average. */
  defence: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface LeagueFit {
  ratings: Map<string, TeamRating>;
  /** Log-scale home advantage; ~0.25 in most European leagues. */
  homeAdvantage: number;
  /** Dixon-Coles low-score dependency parameter. */
  rho: number;
  /**
   * Fitted rate for a hypothetical exactly-average matchup, excluding home
   * advantage. This is NOT the league's mean goal rate: because rates are
   * exponential in the ratings, the mean of exp(...) across real fixtures
   * exceeds exp(mean), so this sits below `observedGoalRate`. Used to project
   * fixtures; never show it to users as "the league average".
   */
  baseRate: number;
  /** Weighted mean goals per team per match actually observed in the sample. */
  observedGoalRate: number;
  matchesUsed: number;
  /** Half-life in days used for recency weighting. */
  halfLifeDays: number;
  /** Converged log-likelihood, for diagnostics. */
  logLikelihood: number;
}

export interface FitOptions {
  /** Weight halves every this many days. 180 ≈ half a season. */
  halfLifeDays?: number;
  /** L2 shrinkage toward league average. */
  regularisation?: number;
  iterations?: number;
  learningRate?: number;
  /**
   * Where a club new to the competition is shrunk toward, in rating units
   * below league average (applied to attack and defence alike). A club is
   * "new" when its first match in the sample comes well after the sample
   * starts — in a domestic league, a promoted side. The pull fades as the
   * club plays: target = prior * k / (k + appearances), k = NEWCOMER_FADE.
   * 0 keeps the old behaviour (newcomers start at league average).
   */
  newcomerPrior?: number;
  /**
   * Share of each team-match's scoring signal taken from shots on target
   * instead of goals, where the row carries them: the fit's response becomes
   * (1 - w) * goals + w * shotsOnTarget * conversion, conversion being the
   * sample's goals per shot on target. Goals are a noisy count of chances
   * taken; shots on target measure the chances themselves. 0 = goals only.
   */
  shotWeight?: number;
}

/** Appearances at which a newcomer's prior counts half as much as at zero. */
const NEWCOMER_FADE = 10;
/** A club first seen this long after the sample starts counts as new. */
const NEWCOMER_GRACE_MS = 200 * 86_400_000;

/*
 * goals-v2 defaults, chosen walk-forward on 2024-25 across eight leagues and
 * confirmed on held-out 2025-26 + 2026-27 (scripts/model-lab.ts): 1X2 log loss
 * 1.0044 -> 1.0003, O/U 2.5 0.6805 -> 0.6790, headline hit 75.5% -> 76.1%,
 * return at closing prices -4.55% -> -2.60%. goals-v1 was 180 / 0.02 / 0 / 0.
 */
const DEFAULTS: Required<FitOptions> = {
  halfLifeDays: 180,
  /** Per-observation L2 weight; shrinks thin samples toward league average. */
  regularisation: 0.01,
  iterations: 200,
  /** Damping on the Newton step — below 1 to keep early iterations stable. */
  learningRate: 0.8,
  newcomerPrior: 0.2,
  shotWeight: 0.5,
};

export function fitLeague(results: ResultRow[], opts: FitOptions = {}): LeagueFit {
  const cfg = { ...DEFAULTS, ...opts };
  const rows = results.filter(
    (r) =>
      Number.isFinite(r.homeGoals) &&
      Number.isFinite(r.awayGoals) &&
      r.homeGoals >= 0 &&
      r.awayGoals >= 0,
  );

  // Index teams. Team identity comes from the provider id, but names are kept
  // for display and for matching a fixture back onto the fitted ratings.
  const index = new Map<string, number>();
  const names: string[] = [];
  const ids: string[] = [];
  const played: number[] = [];
  const goalsFor: number[] = [];
  const goalsAgainst: number[] = [];

  const idFor = (id: string, name: string): number => {
    const key = normaliseKey(name);
    let i = index.get(key);
    if (i === undefined) {
      i = names.length;
      index.set(key, i);
      names.push(name);
      ids.push(id);
      played.push(0);
      goalsFor.push(0);
      goalsAgainst.push(0);
    }
    return i;
  };

  const firstSeen: number[] = [];
  const now = Date.now();
  const decay = Math.log(2) / (cfg.halfLifeDays * 86_400_000);

  const H: number[] = [];
  const A: number[] = [];
  const X: number[] = [];
  const Y: number[] = [];
  const W: number[] = [];
  const SH: (number | undefined)[] = [];
  const SA: (number | undefined)[] = [];

  for (const r of rows) {
    const h = idFor(r.homeId, r.homeName);
    const a = idFor(r.awayId, r.awayName);
    const w = Math.exp(-decay * Math.max(0, now - r.date));
    if (firstSeen[h] === undefined || r.date < firstSeen[h]) firstSeen[h] = r.date;
    if (firstSeen[a] === undefined || r.date < firstSeen[a]) firstSeen[a] = r.date;

    H.push(h);
    A.push(a);
    X.push(r.homeGoals);
    Y.push(r.awayGoals);
    W.push(w);
    const sh = r.homeShotsOnTarget;
    const sa = r.awayShotsOnTarget;
    const hasShots = Number.isFinite(sh) && Number.isFinite(sa) && (sh as number) >= 0 && (sa as number) >= 0;
    SH.push(hasShots ? sh : undefined);
    SA.push(hasShots ? sa : undefined);

    played[h]++;
    played[a]++;
    goalsFor[h] += r.homeGoals;
    goalsAgainst[h] += r.awayGoals;
    goalsFor[a] += r.awayGoals;
    goalsAgainst[a] += r.homeGoals;
  }

  const n = names.length;
  const m = H.length;

  // Response the ratings are fitted to: goals, blended with converted shots on
  // target where present. X/Y stay the real goals (rho reads those).
  const XR = X.slice();
  const YR = Y.slice();
  if (cfg.shotWeight > 0) {
    let g = 0;
    let sot = 0;
    for (let k = 0; k < m; k++) {
      if (SH[k] !== undefined && SA[k] !== undefined) {
        g += X[k] + Y[k];
        sot += (SH[k] as number) + (SA[k] as number);
      }
    }
    const conversion = sot > 0 ? g / sot : 0;
    if (conversion > 0) {
      const w = cfg.shotWeight;
      for (let k = 0; k < m; k++) {
        if (SH[k] === undefined || SA[k] === undefined) continue;
        XR[k] = (1 - w) * X[k] + w * (SH[k] as number) * conversion;
        YR[k] = (1 - w) * Y[k] + w * (SA[k] as number) * conversion;
      }
    }
  }

  if (n === 0 || m === 0) {
    return {
      ratings: new Map(),
      homeAdvantage: 0.25,
      rho: -0.05,
      baseRate: 1.35,
      observedGoalRate: 1.35,
      matchesUsed: 0,
      halfLifeDays: cfg.halfLifeDays,
      logLikelihood: Number.NEGATIVE_INFINITY,
    };
  }

  const attack = new Float64Array(n);
  const defence = new Float64Array(n);
  let homeAdv = 0.25;

  // Shrinkage targets: league average (0) for established clubs, below it for
  // clubs that entered the sample late (promoted), fading with appearances.
  let sampleStart = Number.POSITIVE_INFINITY;
  for (const t of firstSeen) if (t !== undefined && t < sampleStart) sampleStart = t;
  const target = new Float64Array(n);
  if (cfg.newcomerPrior > 0) {
    for (let i = 0; i < n; i++) {
      if (firstSeen[i] - sampleStart > NEWCOMER_GRACE_MS) {
        target[i] = -cfg.newcomerPrior * (NEWCOMER_FADE / (NEWCOMER_FADE + played[i]));
      }
    }
  }

  let wSum = 0;
  let goalSum = 0;
  for (let k = 0; k < m; k++) {
    wSum += W[k] * 2;
    goalSum += W[k] * (X[k] + Y[k]);
  }
  const observedRate = wSum > 0 ? goalSum / wSum : 1.35;
  let intercept = Math.log(Math.max(0.15, observedRate));

  /*
   * Identifiability. The parameter set carries two shift symmetries: moving
   * attack and defence together, and moving the intercept and defence
   * together. Centring both rating vectors kills both, which leaves the
   * intercept and the home advantage free to be estimated.
   *
   * The intercept must be *fitted* rather than pinned to the observed mean.
   * Pinning it forces the overall scoring level to be absorbed by the mean of
   * the defence ratings — but those are L2-penalised toward zero, so the
   * penalty ends up fighting the level constraint and the home advantage
   * collapses toward zero to compensate. Fitting the intercept, and never
   * penalising it or the home advantage, keeps the shrinkage acting only on
   * genuine team-to-team deviations where it belongs.
   */
  const gAttack = new Float64Array(n);
  const gDefence = new Float64Array(n);
  const hAttack = new Float64Array(n);
  const hDefence = new Float64Array(n);

  let ll = Number.NEGATIVE_INFINITY;

  for (let iter = 0; iter < cfg.iterations; iter++) {
    gAttack.fill(0);
    gDefence.fill(0);
    hAttack.fill(0);
    hDefence.fill(0);
    let gHome = 0;
    let hHome = 0;
    let gBase = 0;
    let hBase = 0;
    ll = 0;

    for (let k = 0; k < m; k++) {
      const h = H[k];
      const a = A[k];
      const w = W[k];

      const lam = Math.exp(intercept + attack[h] - defence[a] + homeAdv);
      const mu = Math.exp(intercept + attack[a] - defence[h]);

      const dx = XR[k] - lam;
      const dy = YR[k] - mu;

      // Score: d(ll)/d(attack_home) = w * (x - lambda), and symmetrically.
      gAttack[h] += w * dx;
      gAttack[a] += w * dy;
      gDefence[a] -= w * dx;
      gDefence[h] -= w * dy;
      gHome += w * dx;
      gBase += w * (dx + dy);

      // Negative diagonal of the Hessian. For a log-link Poisson this is just
      // the fitted rate, which makes the Newton step well conditioned.
      hAttack[h] += w * lam;
      hAttack[a] += w * mu;
      hDefence[a] += w * lam;
      hDefence[h] += w * mu;
      hHome += w * lam;
      hBase += w * (lam + mu);

      ll += w * (XR[k] * Math.log(Math.max(lam, 1e-12)) - lam);
      ll += w * (YR[k] * Math.log(Math.max(mu, 1e-12)) - mu);
    }

    // L2 shrinkage toward league average, scaled by total weight so it keeps
    // the same strength whatever the sample size. Applied to the ratings only.
    const pen = cfg.regularisation * wSum;
    for (let i = 0; i < n; i++) {
      gAttack[i] -= pen * (attack[i] - target[i]);
      gDefence[i] -= pen * (defence[i] - target[i]);
      hAttack[i] += pen;
      hDefence[i] += pen;
      ll -= 0.5 * pen * ((attack[i] - target[i]) ** 2 + (defence[i] - target[i]) ** 2);
    }

    // Diagonal Newton: step = gradient / curvature, damped for stability.
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      const sa = clamp((cfg.learningRate * gAttack[i]) / Math.max(hAttack[i], 1e-9), -0.5, 0.5);
      const sd = clamp((cfg.learningRate * gDefence[i]) / Math.max(hDefence[i], 1e-9), -0.5, 0.5);
      attack[i] += sa;
      defence[i] += sd;
      maxStep = Math.max(maxStep, Math.abs(sa), Math.abs(sd));
    }

    const sh = clamp((cfg.learningRate * gHome) / Math.max(hHome, 1e-9), -0.5, 0.5);
    homeAdv = clamp(homeAdv + sh, -0.3, 1.0);

    const sb = clamp((cfg.learningRate * gBase) / Math.max(hBase, 1e-9), -0.5, 0.5);
    intercept += sb;

    maxStep = Math.max(maxStep, Math.abs(sh), Math.abs(sb));

    // Both rating vectors carry a centring constraint; the intercept and the
    // home advantage are what absorb the overall level and the venue effect.
    recentre(attack);
    recentre(defence);

    if (maxStep < 1e-10) break;
  }

  const rho = fitRho(H, A, X, Y, W, attack, defence, homeAdv, intercept);

  const ratings = new Map<string, TeamRating>();
  for (let i = 0; i < n; i++) {
    ratings.set(normaliseKey(names[i]), {
      id: ids[i],
      name: names[i],
      attack: attack[i],
      defence: defence[i],
      played: played[i],
      goalsFor: goalsFor[i],
      goalsAgainst: goalsAgainst[i],
    });
  }

  return {
    ratings,
    homeAdvantage: homeAdv,
    rho,
    baseRate: Math.exp(intercept),
    observedGoalRate: observedRate,
    matchesUsed: m,
    halfLifeDays: cfg.halfLifeDays,
    logLikelihood: ll,
  };
}

/**
 * Grid search for the Dixon-Coles rho.
 *
 * It only affects four cells of the distribution, so a coarse scan over the
 * plausible range is both cheaper and more robust than another gradient run.
 */
function fitRho(
  H: number[], A: number[], X: number[], Y: number[], W: number[],
  attack: Float64Array, defence: Float64Array,
  homeAdv: number, intercept: number,
): number {
  let best = -0.05;
  let bestLL = Number.NEGATIVE_INFINITY;

  for (let rho = -0.2; rho <= 0.101; rho += 0.01) {
    let ll = 0;
    for (let k = 0; k < H.length; k++) {
      const x = X[k];
      const y = Y[k];
      // Only low scorelines carry information about rho.
      if (x > 1 || y > 1) continue;
      const lam = Math.exp(intercept + attack[H[k]] - defence[A[k]] + homeAdv);
      const mu = Math.exp(intercept + attack[A[k]] - defence[H[k]]);
      const t = tau(x, y, lam, mu, rho);
      if (t <= 0) {
        ll = Number.NEGATIVE_INFINITY;
        break;
      }
      ll += W[k] * Math.log(t);
    }
    if (ll > bestLL) {
      bestLL = ll;
      best = rho;
    }
  }
  return best;
}

function mean(v: Float64Array): number {
  if (v.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i];
  return sum / v.length;
}

function recentre(v: Float64Array): void {
  const m = mean(v);
  for (let i = 0; i < v.length; i++) v[i] -= m;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Club names differ across feeds, so ratings are keyed on a normalised form. */
export function normaliseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|afc|cf|sc|ac|as|ss|ssc|bk|sk|if|club|de|the)\b/g, "")
    .replace(/\bmanchester\b/g, "man")
    .replace(/\bunited\b/g, "utd")
    .replace(/\bwolverhampton wanderers\b/g, "wolves")
    .replace(/\btottenham hotspur\b/g, "tottenham")
    .replace(/[^a-z0-9]/g, "");
}

/** Expected goal rates for a fixture under a fitted model. */
export function expectedRates(
  fit: LeagueFit,
  homeName: string,
  awayName: string,
): { lambda: number; mu: number; homeRating?: TeamRating; awayRating?: TeamRating } {
  const h = fit.ratings.get(normaliseKey(homeName));
  const a = fit.ratings.get(normaliseKey(awayName));

  // An unrated club (just promoted, or a cup opponent from another division)
  // is treated as exactly league average rather than dropped.
  const ha = h?.attack ?? 0;
  const hd = h?.defence ?? 0;
  const aa = a?.attack ?? 0;
  const ad = a?.defence ?? 0;

  const base = Math.log(Math.max(0.15, fit.baseRate));
  return {
    lambda: Math.exp(base + ha - ad + fit.homeAdvantage),
    mu: Math.exp(base + aa - hd),
    homeRating: h,
    awayRating: a,
  };
}

export { scoreMatrix };
