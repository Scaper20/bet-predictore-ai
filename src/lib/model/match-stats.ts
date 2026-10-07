/**
 * Count markets beyond goals: corners, cards, shots and shots on target.
 *
 * Each statistic gets its own team ratings, fitted the same way the goals
 * model fits attack and defence: every side has a "for" rate (how many it
 * produces) and an "against" rate (how many it allows), adjusted for who it
 * played, weighted toward recent matches and shrunk toward the league
 * average on thin evidence. A fixture's expected counts are then
 *
 *   home = league home mean × home "for" × away "against"
 *   away = league away mean × away "for" × home "against"
 *
 * The outcome is modelled as a TOTAL and a SPLIT, not as two independent
 * counts, because the two sides are not independent: when one team piles on
 * corners the other gets fewer (home and away corners correlate about -0.3
 * across eight leagues), while cards rise and fall together (about +0.2).
 * The total is negative binomial (football counts are a little more spread
 * than Poisson); given the total, the home share is beta-binomial around the
 * expected share. Both spreads are measured from the same weighted history,
 * so totals, team totals, "most corners" and handicaps all come out of one
 * consistent joint distribution.
 *
 * Cards also carry a referee factor where the source names the referee: some
 * officials book far more than others, and that is known before kickoff.
 *
 * Pure: the walk-forward lab (scripts/stats-lab.ts) and the site share it.
 */

export type StatKind = "corners" | "cards" | "shots" | "shotsOnTarget";

export interface StatSample {
  date: number;
  home: string;
  away: string;
  /** Home and away counts. */
  h: number;
  a: number;
  referee?: string;
}

export interface StatFitOptions {
  /** Recency weighting: a match this many days old counts half. */
  halfLifeDays: number;
  /** Shrinkage, in matches' worth of league-average evidence per team. */
  prior: number;
  /** Shrinkage for the referee factor, in matches; 0 switches it off. */
  refereePrior: number;
  iterations: number;
  /**
   * How far a fixture's expected TOTAL may move from the league's: 1 keeps
   * the ratings' full spread, 0 pins every match to the league average. The
   * split between the sides keeps its full spread either way. Totals regress
   * far harder than shares: a side's corner count swings with game state,
   * but which side wins more of them is much steadier.
   */
  totalShrink: number;
}

/** Tuned walk-forward on 2019-22 and checked on 2022-27 (docs/stats-markets.md). */
export const STAT_OPTIONS: Record<StatKind, StatFitOptions> = {
  corners: { halfLifeDays: 180, prior: 8, refereePrior: 0, iterations: 20, totalShrink: 0.5 },
  cards: { halfLifeDays: 270, prior: 6, refereePrior: 20, iterations: 20, totalShrink: 0.6 },
  shots: { halfLifeDays: 270, prior: 6, refereePrior: 0, iterations: 20, totalShrink: 0.6 },
  shotsOnTarget: { halfLifeDays: 270, prior: 8, refereePrior: 0, iterations: 20, totalShrink: 0.6 },
};

export interface StatFit {
  /** Weighted league means, home and away. */
  muH: number;
  muA: number;
  attack: Map<string, number>;
  defence: Map<string, number>;
  referee: Map<string, number>;
  /** Negative binomial size of the total; Infinity means Poisson. */
  kTotal: number;
  /** Beta-binomial overdispersion of the home share, 0 = binomial. */
  rho: number;
  totalShrink: number;
  /** Effective sample size (sum of weights). */
  weight: number;
  matches: number;
}

const DAY = 86_400_000;

/**
 * Fits one statistic's ratings from `samples` as they stood at `now`
 * (samples after `now` are ignored).
 */
export function fitStat(samples: StatSample[], now: number, opts: StatFitOptions): StatFit {
  const used = samples.filter((s) => s.date < now);
  const w = used.map((s) => Math.pow(0.5, (now - s.date) / (opts.halfLifeDays * DAY)));
  let sw = 0, sh = 0, sa = 0;
  used.forEach((s, i) => {
    sw += w[i];
    sh += w[i] * s.h;
    sa += w[i] * s.a;
  });
  const muH = sw > 0 ? sh / sw : 0;
  const muA = sw > 0 ? sa / sw : 0;

  const attack = new Map<string, number>();
  const defence = new Map<string, number>();
  for (const s of used) {
    attack.set(s.home, 1);
    attack.set(s.away, 1);
    defence.set(s.home, 1);
    defence.set(s.away, 1);
  }

  if (muH > 0 && muA > 0) {
    const K = opts.prior;
    for (let it = 0; it < opts.iterations; it++) {
      const num = new Map<string, number>();
      const den = new Map<string, number>();
      const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? K) + v);
      used.forEach((s, i) => {
        add(num, s.home, (w[i] * s.h) / muH);
        add(den, s.home, w[i] * defence.get(s.away)!);
        add(num, s.away, (w[i] * s.a) / muA);
        add(den, s.away, w[i] * defence.get(s.home)!);
      });
      for (const t of attack.keys()) attack.set(t, (num.get(t) ?? K) / (den.get(t) ?? K));

      const dn = new Map<string, number>();
      const dd = new Map<string, number>();
      const addD = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? K) + v);
      used.forEach((s, i) => {
        addD(dn, s.away, (w[i] * s.h) / muH);
        addD(dd, s.away, w[i] * attack.get(s.home)!);
        addD(dn, s.home, (w[i] * s.a) / muA);
        addD(dd, s.home, w[i] * attack.get(s.away)!);
      });
      for (const t of defence.keys()) defence.set(t, (dn.get(t) ?? K) / (dd.get(t) ?? K));

      // Pin the scale: the league means carry the level, ratings average 1.
      const mean = (m: Map<string, number>) => {
        let s = 0;
        for (const v of m.values()) s += Math.log(v);
        return Math.exp(s / Math.max(1, m.size));
      };
      const ma = mean(attack), md = mean(defence);
      for (const [t, v] of attack) attack.set(t, v / ma);
      for (const [t, v] of defence) defence.set(t, v / md);
    }
  }

  const base = (s: StatSample) => ({
    h: muH * (attack.get(s.home) ?? 1) * (defence.get(s.away) ?? 1),
    a: muA * (attack.get(s.away) ?? 1) * (defence.get(s.home) ?? 1),
  });

  // Referee: observed over expected totals, shrunk toward 1.
  const referee = new Map<string, number>();
  if (opts.refereePrior > 0) {
    const obs = new Map<string, number>();
    const exp = new Map<string, number>();
    used.forEach((s, i) => {
      if (!s.referee) return;
      const e = base(s);
      obs.set(s.referee, (obs.get(s.referee) ?? 0) + w[i] * (s.h + s.a));
      exp.set(s.referee, (exp.get(s.referee) ?? 0) + w[i] * (e.h + e.a));
    });
    const typical = muH + muA;
    for (const [r, o] of obs) {
      const k = opts.refereePrior * typical;
      referee.set(r, (o + k) / (exp.get(r)! + k));
    }
  }

  // Spreads, measured on the same weighted history.
  let tNum = 0, tDen = 0, sNum = 0, sDen = 0;
  used.forEach((s, i) => {
    const e = base(s);
    const r = s.referee ? referee.get(s.referee) ?? 1 : 1;
    const m = (e.h + e.a) * r;
    const n = s.h + s.a;
    tNum += w[i] * ((n - m) ** 2 - m);
    tDen += w[i] * m * m;
    if (n >= 2 && m > 0) {
      const share = e.h / (e.h + e.a);
      sNum += w[i] * ((s.h - n * share) ** 2 - n * share * (1 - share));
      sDen += w[i] * n * (n - 1) * share * (1 - share);
    }
  });
  const invK = tDen > 0 ? tNum / tDen : 0;
  const kTotal = invK > 1e-3 ? Math.max(4, 1 / invK) : Infinity;
  const rho = sDen > 0 ? Math.min(0.4, Math.max(0, sNum / sDen)) : 0;

  return { muH, muA, attack, defence, referee, kTotal, rho, totalShrink: opts.totalShrink, weight: sw, matches: used.length };
}

/** Expected home and away counts for a fixture. */
export function expectStat(fit: StatFit, home: string, away: string, referee?: string): { home: number; away: number } {
  const r = referee ? fit.referee.get(referee) ?? 1 : 1;
  const h = fit.muH * (fit.attack.get(home) ?? 1) * (fit.defence.get(away) ?? 1);
  const a = fit.muA * (fit.attack.get(away) ?? 1) * (fit.defence.get(home) ?? 1);
  const league = fit.muH + fit.muA;
  const total = h + a;
  if (total <= 0 || league <= 0) return { home: h * r, away: a * r };
  const shrunk = league * Math.pow(total / league, fit.totalShrink) * r;
  return { home: (shrunk * h) / total, away: (shrunk * a) / total };
}

/* ------------------------------------------------------------ distributions */

function lgamma(x: number): number {
  // Lanczos, g = 7.
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Negative binomial (mean m, size k; k = Infinity is Poisson) for 0..max. */
export function nbPmf(m: number, k: number, max: number): number[] {
  const out = new Array<number>(max + 1).fill(0);
  if (m <= 0) {
    out[0] = 1;
    return out;
  }
  if (!Number.isFinite(k)) {
    out[0] = Math.exp(-m);
    for (let y = 1; y <= max; y++) out[y] = (out[y - 1] * m) / y;
  } else {
    const p = k / (k + m);
    out[0] = Math.exp(k * Math.log(p));
    for (let y = 1; y <= max; y++) out[y] = (out[y - 1] * (y - 1 + k) * (1 - p)) / y;
  }
  return out;
}

/** Beta-binomial P(X = x | n) with mean share s and overdispersion rho (0 = binomial). */
function splitPmf(n: number, s: number, rho: number): number[] {
  const out = new Array<number>(n + 1).fill(0);
  if (n === 0) {
    out[0] = 1;
    return out;
  }
  const sc = Math.min(1 - 1e-6, Math.max(1e-6, s));
  if (rho <= 1e-6) {
    const lc = (k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
    for (let k = 0; k <= n; k++) out[k] = Math.exp(lc(k) + k * Math.log(sc) + (n - k) * Math.log(1 - sc));
    return out;
  }
  const a = (sc * (1 - rho)) / rho;
  const b = ((1 - sc) * (1 - rho)) / rho;
  const lbeta = (x: number, y: number) => lgamma(x) + lgamma(y) - lgamma(x + y);
  const base = lbeta(a, b);
  for (let k = 0; k <= n; k++) {
    out[k] = Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + lbeta(k + a, n - k + b) - base);
  }
  return out;
}

/** Joint P(home = i, away = j) on a grid up to `max` total. */
export function statGrid(expected: { home: number; away: number }, fit: Pick<StatFit, "kTotal" | "rho">, max: number): number[][] {
  const total = expected.home + expected.away;
  const share = total > 0 ? expected.home / total : 0.5;
  const tp = nbPmf(total, fit.kTotal, max);
  const grid = Array.from({ length: max + 1 }, () => new Array<number>(max + 1).fill(0));
  let mass = 0;
  for (let n = 0; n <= max; n++) {
    if (tp[n] < 1e-12) continue;
    const split = splitPmf(n, share, fit.rho);
    for (let h = 0; h <= n; h++) {
      grid[h][n - h] += tp[n] * split[h];
      mass += tp[n] * split[h];
    }
  }
  // Renormalise the truncated tail away.
  if (mass > 0) for (const row of grid) for (let j = 0; j < row.length; j++) row[j] /= mass;
  return grid;
}

/* ----------------------------------------------------------------- markets */

export interface HandicapPrice {
  home: number;
  away: number;
  /** Whole lines only: the stake back. */
  push: number;
}

export interface StatMarkets {
  expected: { home: number; away: number; total: number };
  /** P(total over line), keyed by the line ("9.5"). */
  over: Record<string, number>;
  homeOver: Record<string, number>;
  awayOver: Record<string, number>;
  /** Which side has more (draw when level). */
  result: { home: number; draw: number; away: number };
  /** Home handicap: home count + line vs away count, keyed by the line ("-1.5"). */
  handicap: Record<string, HandicapPrice>;
  /** Odd total. */
  odd: number;
}

export interface StatLines {
  total: number[];
  team: number[];
  handicap: number[];
  /** Grid size; comfortably past any realistic total. */
  max: number;
}

export const STAT_LINES: Record<StatKind, StatLines> = {
  corners: { total: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5], team: [2.5, 3.5, 4.5, 5.5, 6.5], handicap: [-3.5, -2.5, -1.5, -0.5, 0, 0.5, 1.5, 2.5, 3.5], max: 34 },
  cards: { total: [2.5, 3.5, 4.5, 5.5, 6.5], team: [0.5, 1.5, 2.5, 3.5], handicap: [-1.5, -0.5, 0, 0.5, 1.5], max: 18 },
  shots: { total: [19.5, 21.5, 23.5, 25.5, 27.5, 29.5], team: [8.5, 10.5, 12.5, 14.5, 16.5], handicap: [-6.5, -4.5, -2.5, -0.5, 0.5, 2.5, 4.5, 6.5], max: 70 },
  shotsOnTarget: { total: [6.5, 7.5, 8.5, 9.5, 10.5, 11.5], team: [2.5, 3.5, 4.5, 5.5, 6.5], handicap: [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5], max: 34 },
};

const key = (x: number) => (Number.isInteger(x) ? x.toFixed(0) : String(x));

export function statMarkets(grid: number[][], lines: StatLines): StatMarkets {
  const n = grid.length;
  const tot = new Array<number>(2 * n).fill(0);
  const hm = new Array<number>(n).fill(0);
  const am = new Array<number>(n).fill(0);
  const diff = new Map<number, number>();
  let eh = 0, ea = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = grid[i][j];
      if (p === 0) continue;
      tot[i + j] += p;
      hm[i] += p;
      am[j] += p;
      diff.set(i - j, (diff.get(i - j) ?? 0) + p);
      eh += i * p;
      ea += j * p;
    }
  }
  const tail = (pmf: number[], line: number) => pmf.reduce((s, p, k) => (k > line ? s + p : s), 0);
  const over = Object.fromEntries(lines.total.map((l) => [key(l), tail(tot, l)]));
  const homeOver = Object.fromEntries(lines.team.map((l) => [key(l), tail(hm, l)]));
  const awayOver = Object.fromEntries(lines.team.map((l) => [key(l), tail(am, l)]));
  let home = 0, draw = 0, away = 0;
  for (const [d, p] of diff) {
    if (d > 0) home += p;
    else if (d === 0) draw += p;
    else away += p;
  }
  const handicap: Record<string, HandicapPrice> = {};
  for (const l of lines.handicap) {
    let h = 0, a = 0, push = 0;
    for (const [d, p] of diff) {
      const m = d + l;
      if (m > 0) h += p;
      else if (m < 0) a += p;
      else push += p;
    }
    handicap[key(l)] = { home: h, away: a, push };
  }
  const odd = tot.reduce((s, p, k) => (k % 2 === 1 ? s + p : s), 0);
  return { expected: { home: eh, away: ea, total: eh + ea }, over, homeOver, awayOver, result: { home, draw, away }, handicap, odd };
}
