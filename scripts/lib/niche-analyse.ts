/**
 * Stage 2 of scripts/niche-lab.ts: every model's chance on every selection,
 * graded against what happened, split into a TUNE season (July 2024 to June
 * 2025), where thresholds and filters are chosen, and a HOLDOUT (July 2025
 * on), where they are only measured. A rule that only works on the season it
 * was picked on is luck; the holdout is the test.
 */

import { scoreMatrix } from "../../src/lib/model/poisson";
import { statGrid, statMarkets, STAT_LINES, type StatKind } from "../../src/lib/model/match-stats";
import type { Pred } from "../niche-lab";

const DAY = 86_400_000;
/** Above this a pick pays under 1.18: near-certain and pointless to publish. Every rule here works below it. */
const PMAX = 0.85;
const HOLDOUT = Date.UTC(2025, 6, 1);
const FROM = Date.UTC(2024, 6, 1);
type Grid = number[][];

/* ------------------------------------------------------------ selections */

const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];
const AH = [-2.5, -1.5, 1.5, 2.5];

export const GOAL_KEYS: string[] = [
  "1x2:home", "1x2:draw", "1x2:away",
  "dc:home-draw", "dc:home-away", "dc:away-draw",
  ...GOAL_LINES.flatMap((l) => [`ou:over:${l}`, `ou:under:${l}`]),
  "btts:yes", "btts:no",
  // Each line from both sides: home -1.5 and its mirror, away +1.5.
  ...AH.flatMap((l) => [`ah:home:${l > 0 ? "+" : ""}${l}`, `ah:away:${-l > 0 ? "+" : ""}${-l}`]),
  "team:home:over:0.5", "team:home:over:1.5", "team:away:over:0.5", "team:away:over:1.5",
];

function goalProbs(g: Grid): Float64Array {
  const n = g.length;
  let h = 0, d = 0, a = 0, btts = 0;
  const tot = new Array<number>(2 * n).fill(0);
  const diff = new Map<number, number>();
  const hm = new Array<number>(n).fill(0), am = new Array<number>(n).fill(0);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const p = g[x][y];
      if (x > y) h += p; else if (x === y) d += p; else a += p;
      if (x > 0 && y > 0) btts += p;
      tot[x + y] += p;
      diff.set(x - y, (diff.get(x - y) ?? 0) + p);
      hm[x] += p;
      am[y] += p;
    }
  }
  const over = (l: number) => tot.reduce((s, p, t) => (t > l ? s + p : s), 0);
  const marginAtLeast = (m: number) => [...diff].reduce((s, [k, p]) => (k >= m ? s + p : s), 0);
  const out: number[] = [h, d, a, h + d, h + a, a + d];
  for (const l of GOAL_LINES) {
    const o = over(l);
    out.push(o, 1 - o);
  }
  out.push(btts, 1 - btts);
  for (const l of AH) {
    // Home with handicap l covers when x - y + l > 0, i.e. x - y >= ceil(-l + epsilon).
    const homeCover = marginAtLeast(Math.floor(-l) + 1);
    out.push(homeCover, 1 - homeCover);
  }
  out.push(1 - hm[0], 1 - hm[0] - hm[1], 1 - am[0], 1 - am[0] - am[1]);
  return Float64Array.from(out);
}

function goalWins(x: number, y: number): Uint8Array {
  const t = x + y;
  const w: boolean[] = [x > y, x === y, x < y, x >= y, x !== y, x <= y];
  for (const l of GOAL_LINES) w.push(t > l, t < l);
  w.push(x > 0 && y > 0, !(x > 0 && y > 0));
  for (const l of AH) w.push(x - y + l > 0, y - x - l > 0);
  w.push(x > 0, x > 1, y > 0, y > 1);
  return Uint8Array.from(w.map(Number));
}

const STAT_PREFIX: Record<StatKind, string> = { corners: "corners", shots: "shots", shotsOnTarget: "sot", cards: "cards" };
const statKeyCache = new Map<StatKind, string[]>();

export function statKeys(kind: StatKind): string[] {
  const hit = statKeyCache.get(kind);
  if (hit) return hit;
  const L = STAT_LINES[kind], p = STAT_PREFIX[kind];
  const keys = [
    ...L.total.flatMap((l) => [`${p}:over:${l}`, `${p}:under:${l}`]),
    ...L.team.flatMap((l) => [`${p}:home:over:${l}`, `${p}:home:under:${l}`, `${p}:away:over:${l}`, `${p}:away:under:${l}`]),
    `${p}:most:home`, `${p}:most:away`, `${p}:most:home-or-level`, `${p}:most:away-or-level`,
    ...L.handicap.filter((l) => !Number.isInteger(l)).flatMap((l) => [`${p}:hcp:home:${l > 0 ? "+" : ""}${l}`, `${p}:hcp:away:${-l > 0 ? "+" : ""}${-l}`]),
  ];
  statKeyCache.set(kind, keys);
  return keys;
}

function statProbs(kind: StatKind, grid: Grid): Float64Array {
  const L = STAT_LINES[kind];
  const m = statMarkets(grid, L);
  const k = (x: number) => String(x);
  const out: number[] = [];
  for (const l of L.total) out.push(m.over[k(l)], 1 - m.over[k(l)]);
  for (const l of L.team) out.push(m.homeOver[k(l)], 1 - m.homeOver[k(l)], m.awayOver[k(l)], 1 - m.awayOver[k(l)]);
  out.push(m.result.home, m.result.away, m.result.home + m.result.draw, m.result.away + m.result.draw);
  for (const l of L.handicap.filter((x) => !Number.isInteger(x))) out.push(m.handicap[k(l)].home, m.handicap[k(l)].away);
  return Float64Array.from(out);
}

function statWins(kind: StatKind, h: number, a: number): Uint8Array {
  const L = STAT_LINES[kind];
  const t = h + a;
  const w: boolean[] = [];
  for (const l of L.total) w.push(t > l, t < l);
  for (const l of L.team) w.push(h > l, h < l, a > l, a < l);
  w.push(h > a, a > h, h >= a, a >= h);
  for (const l of L.handicap.filter((x) => !Number.isInteger(x))) w.push(h + l > a, a - l > h);
  return Uint8Array.from(w.map(Number));
}

/* ---------------------------------------------------------- goal models */

function sums(g: Grid): [number, number, number] {
  let h = 0, d = 0, a = 0;
  g.forEach((row, x) => row.forEach((p, y) => (x > y ? (h += p) : x === y ? (d += p) : (a += p))));
  return [h, d, a];
}

/** The same grid with its home-win, draw and away-win regions rescaled to a target 1X2. */
function align(g: Grid, t: [number, number, number]): Grid {
  const [h, d, a] = sums(g);
  return g.map((row, x) => row.map((p, y) => p * (x > y ? t[0] / h : x === y ? t[1] / d : t[2] / a)));
}

function mix(g1: Grid, g2: Grid, w: number): Grid {
  return g1.map((row, x) => row.map((p, y) => (1 - w) * p + w * g2[x][y]));
}

/** A Poisson grid matching the market's over/under 2.5 and home-minus-away, then aligned to its 1X2. */
function marketGrid(mk: [number, number, number, number]): Grid {
  const [ph, pd, pa, po] = mk;
  // Total goals from over 2.5 (Poisson total), by bisection.
  let lo = 0.3, hi = 6;
  for (let i = 0; i < 40; i++) {
    const T = (lo + hi) / 2;
    const under = Math.exp(-T) * (1 + T + (T * T) / 2);
    if (1 - under < po) lo = T; else hi = T;
  }
  const T = (lo + hi) / 2;
  // Home share from home-minus-away, by bisection.
  let s0 = 0.05, s1 = 0.95;
  for (let i = 0; i < 30; i++) {
    const s = (s0 + s1) / 2;
    const [h, , a] = sums(scoreMatrix(T * s, T * (1 - s), 0));
    if (h - a < ph - pa) s0 = s; else s1 = s;
  }
  const s = (s0 + s1) / 2;
  return align(scoreMatrix(T * s, T * (1 - s), 0), [ph, pd, pa]);
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Ordered logit from pi-rating goal difference to 1X2, fitted by gradient ascent. */
function fitOrdered(gs: number[], outcomes: number[]): (g: number) => [number, number, number] {
  let b = 1, c1 = -0.6, c2 = 0.6;
  const lr = 0.5;
  for (let it = 0; it < 400; it++) {
    let gb = 0, g1 = 0, g2 = 0;
    for (let i = 0; i < gs.length; i++) {
      const z = b * gs[i];
      const pA = sigmoid(c1 - z), pNotH = sigmoid(c2 - z);
      const pD = Math.max(1e-9, pNotH - pA), pH = Math.max(1e-9, 1 - pNotH);
      const dA = pA * (1 - pA), dN = pNotH * (1 - pNotH);
      // d log-likelihood for each outcome.
      if (outcomes[i] === 2) { g1 += dA / pA; gb += (-dA * gs[i]) / pA; }
      else if (outcomes[i] === 1) { g2 += dN / pD; g1 -= dA / pD; gb += (-(dN - dA) * gs[i]) / pD; }
      else { g2 -= dN / pH; gb += (dN * gs[i]) / pH; }
    }
    b += (lr * gb) / gs.length;
    c1 += (lr * g1) / gs.length;
    c2 += (lr * g2) / gs.length;
    if (c2 < c1 + 0.05) c2 = c1 + 0.05;
  }
  return (g) => {
    const z = b * g;
    const pA = sigmoid(c1 - z), pNotH = sigmoid(c2 - z);
    return [1 - pNotH, pNotH - pA, pA];
  };
}

/** Platt scaling: logit(q) = a + b logit(p), fitted by Newton's method on (p, outcome) pairs. */
export function fitPlatt(ps: number[], ys: number[]): { a: number; b: number } {
  const lg = (p: number) => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
  let a = 0, b = 1;
  for (let it = 0; it < 50; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < ps.length; i++) {
      const x = lg(ps[i]);
      const q = sigmoid(a + b * x);
      const r = ys[i] - q, w = q * (1 - q);
      ga += r; gb += r * x;
      haa += w; hab += w * x; hbb += w * x * x;
    }
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    a += (hbb * ga - hab * gb) / det;
    b += (haa * gb - hab * ga) / det;
  }
  return { a, b };
}

export const platt = (c: { a: number; b: number }, p: number) => {
  const q = Math.min(0.999, Math.max(0.001, p));
  return sigmoid(c.a + c.b * Math.log(q / (1 - q)));
};

/** The 1X2 corrected by its own record, the draw taking up the rest, the grid re-weighted to match. */
function calibratedGrid(g: Grid, ch: { a: number; b: number }, ca: { a: number; b: number }): Grid {
  const [h, , a] = sums(g);
  let qh = platt(ch, h), qa = platt(ca, a);
  const qd = Math.max(0.08, 1 - qh - qa);
  const z = qh + qd + qa;
  qh /= z; qa /= z;
  return align(g, [qh, qd / z, qa]);
}

/* ------------------------------------------------------------- tallies */

interface Sel {
  i: number;
  p: number;
  w: number;
}

export interface Model {
  name: string;
  keys: string[];
  /** Per prediction index: chance per key, or null where the model has no view. */
  probs: (Float64Array | null)[];
  wins: (Uint8Array | null)[];
}

const isHold = (p: Pred) => p.t >= HOLDOUT;
const week = (t: number) => Math.floor((t - FROM) / (7 * DAY));

function group(key: string): string {
  const f = key.split(":")[0];
  return ({ "1x2": "result", dc: "double chance", ou: "goals over/under", btts: "both score", ah: "asian handicap", team: "team goals" } as Record<string, string>)[f] ?? f;
}

function selections(m: Model, preds: Pred[], k: number, hold: boolean): Sel[] {
  const out: Sel[] = [];
  m.probs.forEach((pr, i) => {
    if (!pr || isHold(preds[i]) !== hold) return;
    out.push({ i, p: pr[k], w: m.wins[i]![k] });
  });
  return out;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

function brier(sel: Sel[]): number {
  return sel.reduce((s, x) => s + (x.p - x.w) ** 2, 0) / Math.max(1, sel.length);
}

/* ----------------------------------------------------------- isotonic */

/** Pool-adjacent-violators: a monotone map from stated to observed. */
function isotonic(pairs: { p: number; w: number }[]): (p: number) => number {
  const s = [...pairs].sort((a, b) => a.p - b.p);
  const blocks: { lo: number; hi: number; sum: number; n: number }[] = [];
  for (const x of s) {
    blocks.push({ lo: x.p, hi: x.p, sum: x.w, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!, a = blocks.pop()!;
      blocks.push({ lo: a.lo, hi: b.hi, sum: a.sum + b.sum, n: a.n + b.n });
    }
  }
  // Light smoothing toward the stated value on thin blocks.
  const pts = blocks.map((b) => ({ x: (b.lo + b.hi) / 2, y: (b.sum + 10 * ((b.lo + b.hi) / 2)) / (b.n + 10) }));
  return (p) => {
    if (pts.length === 0) return p;
    if (p <= pts[0].x) return pts[0].y;
    if (p >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    let j = 1;
    while (pts[j].x < p) j++;
    const a = pts[j - 1], b = pts[j];
    return a.y + ((p - a.x) / (b.x - a.x)) * (b.y - a.y);
  };
}

/** The same model with each selection's chance remapped by its own tune-season record. */
function recalibrated(m: Model, preds: Pred[]): Model {
  const maps = m.keys.map((_, k) => isotonic(selections(m, preds, k, false)));
  return {
    name: `${m.name}+self`,
    keys: m.keys,
    wins: m.wins,
    probs: m.probs.map((pr) => (pr ? Float64Array.from(pr, (p, k) => maps[k](p)) : null)),
  };
}

/* ------------------------------------------------------------ policies */

interface Policy {
  model: Model;
  k: number;
  threshold: number;
  tuneHit: number;
  tuneN: number;
  leagues: Set<string> | null;
}

/**
 * For one selection: the lowest threshold whose TUNE record reaches the target
 * with enough picks, and optionally the leagues where it held up in tune.
 */
function choose(m: Model, preds: Pred[], k: number, target: number, minN: number, leagueFilter: boolean): Policy | null {
  const tune = selections(m, preds, k, false);
  for (let t = 0.5; t <= PMAX - 0.02; t += 0.01) {
    let pool = tune.filter((s) => s.p >= t && s.p <= PMAX);
    let leagues: Set<string> | null = null;
    if (leagueFilter) {
      const by = new Map<string, { n: number; w: number }>();
      for (const s of pool) {
        const d = preds[s.i].d;
        const b = by.get(d) ?? { n: 0, w: 0 };
        b.n++; b.w += s.w;
        by.set(d, b);
      }
      leagues = new Set([...by].filter(([, b]) => b.n < 15 || b.w / b.n >= target - 0.04).map(([d]) => d));
      pool = pool.filter((s) => leagues!.has(preds[s.i].d));
    }
    if (pool.length < minN) return null;
    const hit = pool.reduce((s, x) => s + x.w, 0) / pool.length;
    if (hit >= target) return { model: m, k, threshold: t, tuneHit: hit, tuneN: pool.length, leagues };
  }
  return null;
}

function apply(pol: Policy, preds: Pred[], hold = true): Sel[] {
  return selections(pol.model, preds, pol.k, hold).filter((s) => s.p >= pol.threshold && s.p <= PMAX && (!pol.leagues || pol.leagues.has(preds[s.i].d)));
}

function consistency(sel: Sel[], preds: Pred[]) {
  const weeks = new Map<number, { n: number; w: number }>();
  for (const s of sel) {
    const k = week(preds[s.i].t);
    const b = weeks.get(k) ?? { n: 0, w: 0 };
    b.n++; b.w += s.w;
    weeks.set(k, b);
  }
  const rates = [...weeks.values()].filter((b) => b.n >= 3).map((b) => b.w / b.n).sort((a, b) => a - b);
  const q = (f: number) => (rates.length ? rates[Math.min(rates.length - 1, Math.floor(f * rates.length))] : NaN);
  // Longest run of losses in kick-off order.
  const ordered = [...sel].sort((a, b) => preds[a.i].t - preds[b.i].t);
  let run = 0, worst = 0;
  for (const s of ordered) {
    run = s.w ? 0 : run + 1;
    worst = Math.max(worst, run);
  }
  return { weeks: rates.length, p10: q(0.1), median: q(0.5), atLeast75: rates.filter((r) => r >= 0.75).length / Math.max(1, rates.length), worstRun: worst };
}

/* ------------------------------------------------------------- report */

export function analyse(preds: Pred[], argv: string[]) {
  const holdWeeks = (Date.now() - HOLDOUT) / (7 * DAY);
  const tunePreds = preds.filter((p) => !isHold(p));
  console.log(`NICHE LAB: ${preds.length} fixtures in 17 divisions; tune ${tunePreds.length} (Jul 2024 - Jun 2025), holdout ${preds.length - tunePreds.length} (Jul 2025 - now, ${holdWeeks.toFixed(0)} weeks)`);

  // Goal models.
  const outcome = (p: Pred) => (p.hg > p.ag ? 0 : p.hg === p.ag ? 1 : 2);
  const piMap = fitOrdered(tunePreds.map((p) => p.pi), tunePreds.map(outcome));
  const dcGrid = preds.map((p) => scoreMatrix(p.dc[0], p.dc[1], p.dc[2]));
  const wins = preds.map((p) => goalWins(p.hg, p.ag));
  const goalModel = (name: string, grid: (i: number) => Grid | null): Model => ({
    name,
    keys: GOAL_KEYS,
    wins,
    probs: preds.map((_, i) => {
      const g = grid(i);
      return g ? goalProbs(g) : null;
    }),
  });
  const hasMk = (i: number) => preds[i].mk !== null;
  const avg3 = (a: [number, number, number], b: [number, number, number], w: number): [number, number, number] => [0, 1, 2].map((j) => (1 - w) * a[j] + w * b[j]) as [number, number, number];
  // Every goal model is scored on the same fixtures: the ones with closing prices.
  const dc = goalModel("dc", (i) => (hasMk(i) ? dcGrid[i] : null));
  const pi = goalModel("pi", (i) => (hasMk(i) ? align(dcGrid[i], piMap(preds[i].pi)) : null));
  const dcpi = goalModel("dc+pi", (i) => (hasMk(i) ? align(dcGrid[i], avg3(sums(dcGrid[i]), piMap(preds[i].pi), 0.5)) : null));
  const mkGrids = preds.map((p) => (p.mk ? marketGrid(p.mk) : null));
  const mk = goalModel("market", (i) => mkGrids[i]);
  const dcmk = goalModel("dc+market", (i) => (mkGrids[i] ? mix(dcGrid[i], mkGrids[i]!, 0.6) : null));
  // Result correction learned from the model's own TUNE record.
  const tuneIdx = preds.map((p, i) => (!isHold(p) && hasMk(i) ? i : -1)).filter((i) => i >= 0);
  const calH = fitPlatt(tuneIdx.map((i) => sums(dcGrid[i])[0]), tuneIdx.map((i) => Number(preds[i].hg > preds[i].ag)));
  const calA = fitPlatt(tuneIdx.map((i) => sums(dcGrid[i])[2]), tuneIdx.map((i) => Number(preds[i].hg < preds[i].ag)));
  console.log(`  result correction (tune): home logit a=${calH.a.toFixed(3)} b=${calH.b.toFixed(3)}; away a=${calA.a.toFixed(3)} b=${calA.b.toFixed(3)}`);
  const allIdx = preds.map((_, i) => i);
  const allH = fitPlatt(allIdx.map((i) => sums(dcGrid[i])[0]), allIdx.map((i) => Number(preds[i].hg > preds[i].ag)));
  const allA = fitPlatt(allIdx.map((i) => sums(dcGrid[i])[2]), allIdx.map((i) => Number(preds[i].hg < preds[i].ag)));
  console.log(`  result correction for production (all ${preds.length}, paste into src/lib/model/result-calibration.ts): home { a: ${allH.a.toFixed(3)}, b: ${allH.b.toFixed(3)} }, away { a: ${allA.a.toFixed(3)}, b: ${allA.b.toFixed(3)} }`);
  const dccal = goalModel("dc+cal", (i) => (hasMk(i) ? calibratedGrid(dcGrid[i], calH, calA) : null));
  const dcpiGrid = (i: number) => align(dcGrid[i], avg3(sums(dcGrid[i]), piMap(preds[i].pi), 0.5));
  const calHp = fitPlatt(tuneIdx.map((i) => sums(dcpiGrid(i))[0]), tuneIdx.map((i) => Number(preds[i].hg > preds[i].ag)));
  const calAp = fitPlatt(tuneIdx.map((i) => sums(dcpiGrid(i))[2]), tuneIdx.map((i) => Number(preds[i].hg < preds[i].ag)));
  const dcpical = goalModel("dc+pi+cal", (i) => (hasMk(i) ? calibratedGrid(dcpiGrid(i), calHp, calAp) : null));
  const goalModels = [dc, pi, dcpi, dccal, dcpical, mk, dcmk];
  const goalSelf = [recalibrated(dc, preds), recalibrated(dcpi, preds)];

  // Count models.
  const statModels: Model[] = [];
  for (const kind of ["corners", "shots", "shotsOnTarget"] as StatKind[]) {
    const keys = statKeys(kind);
    const L = STAT_LINES[kind];
    const ok = (p: Pred) => p.st[kind] && p.st[kind]![6] >= 0;
    const w = preds.map((p) => (ok(p) ? statWins(kind, p.st[kind]![6], p.st[kind]![7]) : null));
    const nb = preds.map((p) => (ok(p) ? statProbs(kind, statGrid({ home: p.st[kind]![0], away: p.st[kind]![1] }, { kTotal: p.st[kind]![2], rho: p.st[kind]![3] }, L.max)) : null));
    const nv = preds.map((p) => (ok(p) ? statProbs(kind, statGrid({ home: p.st[kind]![4], away: p.st[kind]![5] }, { kTotal: Infinity, rho: 0 }, L.max)) : null));
    const label = STAT_PREFIX[kind];
    statModels.push(
      { name: `${label}:nb`, keys, wins: w, probs: nb },
      { name: `${label}:avg`, keys, wins: w, probs: nv },
      { name: `${label}:nb+avg`, keys, wins: w, probs: nb.map((a, i) => (a && nv[i] ? Float64Array.from(a, (x, k) => 0.5 * x + 0.5 * nv[i]![k]) : null)) },
    );
  }
  const statSelf = statModels.filter((m) => m.name.endsWith(":nb")).map((m) => recalibrated(m, preds));

  /* 1. Sharpness: Brier score per group on the holdout (lower is better). */
  console.log("\n1. WHICH MATHS IS SHARPER: holdout Brier score per market group, lower is better");
  const groupsOf = (m: Model) => [...new Set(m.keys.map(group))];
  const brierBy = (m: Model) =>
    Object.fromEntries(
      groupsOf(m).map((g) => {
        const sel = m.keys.flatMap((key, k) => (group(key) === g ? selections(m, preds, k, true) : []));
        return [g, brier(sel)];
      }),
    );
  for (const set of [[...goalModels, ...goalSelf], ...["corners", "shots", "sot"].map((p) => [...statModels, ...statSelf].filter((m) => m.name.startsWith(p)))]) {
    const groups = groupsOf(set[0]);
    console.log(`  ${"model".padEnd(18)} ${groups.map((g) => g.padStart(17)).join("")}`);
    for (const m of set) {
      const b = brierBy(m);
      console.log(`  ${m.name.padEnd(18)} ${groups.map((g) => b[g].toFixed(4).padStart(17)).join("")}`);
    }
  }

  /* 2. Calibration of the production model on the holdout, per group and band. */
  console.log("\n2. IS 80% REALLY 80%: production model, holdout, stated vs landed per band (all selections)");
  const bandLine = (m: Model, g: string) => {
    const bands = [0.5, 0.6, 0.7, 0.8, 0.9];
    const sel = m.keys.flatMap((key, k) => (group(key) === g ? selections(m, preds, k, true) : []));
    return bands
      .map((lo) => {
        const b = sel.filter((s) => s.p >= lo && s.p < lo + 0.1);
        if (b.length < 30) return `${Math.round(lo * 100)}s: —`.padEnd(24);
        const st = b.reduce((s, x) => s + x.p, 0) / b.length, hit = b.reduce((s, x) => s + x.w, 0) / b.length;
        return `${Math.round(lo * 100)}s: ${(100 * hit).toFixed(0)} vs ${(100 * st).toFixed(0)} (${b.length})`.padEnd(24);
      })
      .join("");
  };
  for (const m of [dc, dccal, ...statModels.filter((x) => x.name.endsWith(":nb"))]) {
    for (const g of groupsOf(m)) console.log(`  ${`${m.name} ${g}`.padEnd(30)} ${bandLine(m, g)}`);
  }

  /* 3. Every selection: tune-chosen threshold for 80/85/90%, measured on the holdout. */
  const targets = [0.8, 0.85, 0.9];
  const allModels = [...goalModels, ...goalSelf, ...statModels, ...statSelf];
  console.log("\n3. SWEET SPOTS: for each selection, the lowest threshold that reached the target in TUNE (100+ picks), then the HOLDOUT result");
  console.log("   (one line per selection and target; best model shown; per week = holdout picks per week across 17 divisions)");
  const winners: { key: string; target: number; pol: Policy; hold: Sel[] }[] = [];
  const keySet = new Set(allModels.flatMap((m) => m.keys));
  for (const key of keySet) {
    for (const target of targets) {
      let best: { pol: Policy; hold: Sel[]; score: number } | null = null;
      for (const m of allModels) {
        const k = m.keys.indexOf(key);
        if (k < 0) continue;
        for (const lf of [false, true]) {
          const pol = choose(m, preds, k, target, 100, lf);
          if (!pol) continue;
          const tuneSel = apply(pol, preds, false);
          // Model choice on TUNE volume at the target, never on the holdout.
          const score = tuneSel.length;
          if (!best || score > best.score) best = { pol, hold: apply(pol, preds, true), score };
        }
      }
      if (best && best.hold.length >= 20) winners.push({ key, target, pol: best.pol, hold: best.hold });
    }
  }
  winners.sort((a, b) => group(a.key).localeCompare(group(b.key)) || a.key.localeCompare(b.key) || a.target - b.target);
  let lastGroup = "";
  for (const x of winners) {
    if (group(x.key) !== lastGroup) {
      lastGroup = group(x.key);
      console.log(`\n  ${lastGroup.toUpperCase()}`);
    }
    const hit = x.hold.reduce((s, v) => s + v.w, 0) / x.hold.length;
    const odds = x.hold.reduce((s, v) => s + 1 / v.p, 0) / x.hold.length;
    const c = consistency(x.hold, preds);
    console.log(
      `  ${x.key.padEnd(26)} target ${Math.round(x.target * 100)}  ${x.pol.model.name.padEnd(16)} p>=${x.pol.threshold.toFixed(2)}${x.pol.leagues ? ` in ${x.pol.leagues.size} lg` : "      "}  tune ${pct(x.pol.tuneHit)} (${x.pol.tuneN})  HOLDOUT ${pct(hit).padStart(6)} of ${String(x.hold.length).padStart(5)}  ${(x.hold.length / holdWeeks).toFixed(1).padStart(5)}/wk  odds ${odds.toFixed(2)}  weeks>=75% ${pct(c.atLeast75)}  worst run ${c.worstRun}`,
    );
  }

  /* 4. The published headline pick, as the baseline. */
  console.log("\n4. BASELINE: the production headline pick on the holdout");
  const pubSel: Sel[] = [];
  preds.forEach((p, i) => {
    if (!p.pub || !isHold(p)) return;
    const k = GOAL_KEYS.indexOf(p.pub[0]);
    if (k < 0) return;
    pubSel.push({ i, p: p.pub[1], w: wins[i][k] });
  });
  const pubHit = pubSel.reduce((s, v) => s + v.w, 0) / pubSel.length;
  const pc = consistency(pubSel, preds);
  console.log(`  ${pubSel.length} picks, landed ${pct(pubHit)}, stated ${pct(pubSel.reduce((s, v) => s + v.p, 0) / pubSel.length)}, ${(pubSel.length / holdWeeks).toFixed(0)}/wk; weekly median ${pct(pc.median)}, worst 10% of weeks ${pct(pc.p10)}, weeks >= 75% ${pct(pc.atLeast75)}`);

  /* 5. A daily slate built from the sweet spots: one pick per fixture. */
  for (const target of [0.8, 0.85]) {
    const chosen = winners.filter((x) => x.target === target);
    const best = new Map<number, { s: Sel; key: string; q: number }>();
    for (const x of chosen) {
      for (const s of x.hold) {
        const cur = best.get(s.i);
        // The qualifying selection whose rule held best in TUNE wins the fixture.
        if (!cur || x.pol.tuneHit > cur.q) best.set(s.i, { s, key: x.key, q: x.pol.tuneHit });
      }
    }
    const slate = [...best.values()].map((b) => b.s);
    const hit = slate.reduce((a, v) => a + v.w, 0) / Math.max(1, slate.length);
    const c = consistency(slate, preds);
    const byGroup = new Map<string, { n: number; w: number }>();
    for (const b of best.values()) {
      const g = group(b.key);
      const t = byGroup.get(g) ?? { n: 0, w: 0 };
      t.n++; t.w += b.s.w;
      byGroup.set(g, t);
    }
    const days = new Map<number, { n: number; w: number }>();
    for (const s of slate) {
      const d = Math.floor(preds[s.i].t / DAY);
      const t = days.get(d) ?? { n: 0, w: 0 };
      t.n++; t.w += s.w;
      days.set(d, t);
    }
    const dayRates = [...days.values()].filter((d) => d.n >= 4).map((d) => d.w / d.n);
    console.log(`\n5. DAILY SLATE FROM THE ${Math.round(target * 100)}% SWEET SPOTS (holdout, one pick per fixture)`);
    console.log(`  ${slate.length} picks, ${(slate.length / holdWeeks).toFixed(0)}/wk, landed ${pct(hit)}; weekly median ${pct(c.median)}, worst 10% of weeks ${pct(c.p10)}, weeks >= 75% ${pct(c.atLeast75)}, longest losing run ${c.worstRun}`);
    console.log(`  days with 4+ picks: ${dayRates.length}; days at 75%+ ${pct(dayRates.filter((r) => r >= 0.75).length / Math.max(1, dayRates.length))}; days under 60% ${pct(dayRates.filter((r) => r < 0.6).length / Math.max(1, dayRates.length))}`);
    console.log(`  by market group: ${[...byGroup].sort((a, b) => b[1].n - a[1].n).map(([g, t]) => `${g} ${t.n} at ${pct(t.w / t.n)}`).join("; ")}`);
  }

  /* 6. Leagues: the production model's strong selections, tune vs holdout. */
  console.log("\n6. LEAGUES: production model, every goal selection stated 75%+ (result, double chance, over/under, handicap)");
  const strong = (hold: boolean) => {
    const by = new Map<string, { n: number; w: number; p: number }>();
    dc.keys.forEach((key, k) => {
      if (!["result", "double chance", "goals over/under", "asian handicap"].includes(group(key))) return;
      for (const s of selections(dc, preds, k, hold)) {
        if (s.p < 0.75) continue;
        const d = preds[s.i].d;
        const b = by.get(d) ?? { n: 0, w: 0, p: 0 };
        b.n++; b.w += s.w; b.p += s.p;
        by.set(d, b);
      }
    });
    return by;
  };
  const tuneL = strong(false), holdL = strong(true);
  const rows = [...holdL].map(([d, h]) => ({ d, h, t: tuneL.get(d) })).sort((a, b) => a.h.w / a.h.n - a.h.p / a.h.n - (b.h.w / b.h.n - b.h.p / b.h.n));
  for (const r of rows) {
    const gap = (b: { n: number; w: number; p: number } | undefined) => (b ? (100 * (b.w - b.p)) / b.n : NaN);
    console.log(`  ${r.d.padEnd(4)} holdout ${pct(r.h.w / r.h.n)} vs stated ${pct(r.h.p / r.h.n)} (${r.h.n}, gap ${gap(r.h).toFixed(1)})   tune gap ${gap(r.t).toFixed(1)} (${r.t?.n ?? 0})`);
  }

  /* 7. Learning from its own record: tune-fitted correction, holdout check. */
  console.log("\n7. LEARNING FROM ITS OWN RECORD: selections stated 75%+ on the holdout, before and after the tune-season correction");
  for (const [raw, fixed] of [[dc, goalSelf[0]], [dcpi, goalSelf[1]], ...statModels.filter((m) => m.name.endsWith(":nb")).map((m, j) => [m, statSelf[j]])] as [Model, Model][]) {
    for (const g of groupsOf(raw)) {
      const line = (m: Model) => {
        const sel = m.keys.flatMap((key, k) => (group(key) === g ? selections(m, preds, k, true) : [])).filter((x) => x.p >= 0.75);
        if (sel.length < 50) return "—".padEnd(30);
        return `${pct(sel.reduce((a, v) => a + v.w, 0) / sel.length)} vs ${pct(sel.reduce((a, v) => a + v.p, 0) / sel.length)} (${sel.length})`.padEnd(30);
      };
      console.log(`  ${`${raw.name} ${g}`.padEnd(32)} raw ${line(raw)} corrected ${line(fixed)}`);
    }
  }

  /* 8. Where the production model under-rates itself, in both seasons. */
  console.log("\n8. UNDER-RATED SELECTIONS: production models, playable range (stated 60-85%), landed minus stated in TUNE and HOLDOUT");
  const edgeRows: string[] = [];
  for (const m of [dc, dcpi, dccal, dcpical, ...statModels.filter((x) => x.name.endsWith(":nb"))]) {
    m.keys.forEach((key, k) => {
      for (const [lo, hi] of [[0.6, 0.7], [0.7, 0.8], [0.8, PMAX]] as const) {
        const cut = (hold: boolean) => selections(m, preds, k, hold).filter((x) => x.p >= lo && x.p < hi);
        const t = cut(false), h = cut(true);
        if (t.length < 80 || h.length < 80) continue;
        const gap = (sel: Sel[]) => (100 * sel.reduce((a, v) => a + v.w - v.p, 0)) / sel.length;
        const hit = (sel: Sel[]) => sel.reduce((a, v) => a + v.w, 0) / sel.length;
        const gt = gap(t), gh = gap(h);
        if (gt >= 2.5 && gh >= 2.5) {
          edgeRows.push(`  ${m.name.padEnd(10)} ${key.padEnd(26)} ${Math.round(lo * 100)}-${Math.round(hi * 100)}%  tune ${pct(hit(t))} (+${gt.toFixed(1)}, ${t.length})  holdout ${pct(hit(h))} (+${gh.toFixed(1)}, ${h.length}, ${(h.length / holdWeeks).toFixed(1)}/wk)  odds ${(h.reduce((a, v) => a + 1 / v.p, 0) / h.length).toFixed(2)}`);
        }
      }
    });
  }
  console.log(edgeRows.length ? edgeRows.join("\n") : "  none");

  /* 9. Headline rules: one pick per fixture, graded, priced at the closing market. */
  console.log("\n9. HEADLINE RULES ON THE HOLDOUT: one pick per fixture; price = closing market's fair odds for that pick (no bookmaker margin)");
  const HEAD = ["1x2:home", "1x2:away", "dc:home-draw", "dc:home-away", "dc:away-draw", "ou:over:1.5", "ou:over:2.5"].map((k) => GOAL_KEYS.indexOf(k));
  const mkProbs = mk.probs;
  const rule = (label: string, m: Model, floor: number, cap = 0.97, keys = HEAD) => {
    let n = 0, w = 0, st = 0, price = 0, priced = 0, said = 0;
    const weeksMap = new Map<number, { n: number; w: number }>();
    const fams = new Map<string, { n: number; w: number }>();
    preds.forEach((p, i) => {
      if (!isHold(p) || !m.probs[i] || !mkProbs[i]) return;
      const pr = m.probs[i]!;
      let bk = -1;
      for (const k of keys) if (pr[k] <= 1 / floor && pr[k] <= cap && (bk < 0 || pr[k] > pr[bk])) bk = k;
      if (bk < 0) return;
      const won = wins[i][bk];
      n++; w += won; st += pr[bk];
      price += 1 / mkProbs[i]![bk]; priced++; said += mkProbs[i]![bk];
      const wk = week(p.t);
      const b = weeksMap.get(wk) ?? { n: 0, w: 0 };
      b.n++; b.w += won;
      weeksMap.set(wk, b);
      const f = GOAL_KEYS[bk];
      const fb = fams.get(f) ?? { n: 0, w: 0 };
      fb.n++; fb.w += won;
      fams.set(f, fb);
    });
    const rates = [...weeksMap.values()].filter((b) => b.n >= 10).map((b) => b.w / b.n).sort((a, b) => a - b);
    const p10 = rates[Math.floor(0.1 * rates.length)];
    console.log(`  ${label.padEnd(44)} ${String(n).padStart(5)} picks  landed ${pct(w / n)}  stated ${pct(st / n)}  market said ${pct(said / priced)}  market price ${(price / priced).toFixed(2)}  worst 10% of weeks ${pct(p10)}`);
    console.log(`      ${[...fams].sort((a, b) => b[1].n - a[1].n).map(([f, b]) => `${f} ${b.n} @ ${pct(b.w / b.n)}`).join(", ")}`);
  };
  {
    let n = 0, w = 0, price = 0, said = 0, st = 0;
    preds.forEach((p, i) => {
      if (!isHold(p) || !p.pub || !mkProbs[i]) return;
      const k = GOAL_KEYS.indexOf(p.pub[0]);
      if (k < 0) return;
      n++; w += wins[i][k]; price += 1 / mkProbs[i]![k]; said += mkProbs[i]![k]; st += p.pub[1];
    });
    console.log(`  ${"production headline pick (today's rule)".padEnd(44)} ${String(n).padStart(5)} picks  landed ${pct(w / n)}  stated ${pct(st / n)}  market said ${pct(said / n)}  market price ${(price / n).toFixed(2)}`);
  }
  for (const floor of [1.25, 1.3, 1.35]) {
    rule(`most likely, raw model, price floor ${floor}`, dc, floor);
    rule(`most likely, corrected model, price floor ${floor}`, dccal, floor);
    rule(`most likely, corrected + pi, price floor ${floor}`, dcpical, floor);
  }
  rule("most likely, market itself, price floor 1.30", mk, 1.3);

  void argv;
  return { winners, preds, goalModels, statModels };
}
