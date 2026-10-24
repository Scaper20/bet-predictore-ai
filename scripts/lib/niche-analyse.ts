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

const STAT_PREFIX: Record<StatKind, string> = { corners: "corners", shots: "shots", shotsOnTarget: "sot", cards: "cards", bookings: "bookings" };
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

  if (argv.includes("--ship")) {
    shippable(preds, goalModel("dc", (i) => dcGrid[i]), dcGrid, statModels.filter((m) => m.name.endsWith(":nb")), wins, holdWeeks);
    return { winners: [], preds, goalModels, statModels };
  }

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

/* ------------------------------------------------- 10. shippable picks */

/**
 * Big clubs as the model sees them before each game: the top three of the
 * division by average expected goal difference over their last 10 games
 * (5 at least), from fixtures already played. No look-ahead.
 */
function bigFlags(preds: Pred[]): { home: boolean[]; away: boolean[] } {
  const home = new Array<boolean>(preds.length).fill(false), away = new Array<boolean>(preds.length).fill(false);
  const order = preds.map((_, i) => i).sort((a, b) => preds[a].t - preds[b].t);
  const recent = new Map<string, number[]>();
  const top = (d: string) => {
    const rows: { team: string; s: number }[] = [];
    for (const [k, v] of recent) if (k.startsWith(`${d}|`) && v.length >= 5) rows.push({ team: k.slice(d.length + 1), s: v.reduce((a, x) => a + x, 0) / v.length });
    return new Set(rows.sort((a, b) => b.s - a.s).slice(0, 3).map((r) => r.team));
  };
  const push = (k: string, v: number) => {
    const a = recent.get(k) ?? [];
    a.push(v);
    if (a.length > 10) a.shift();
    recent.set(k, a);
  };
  let j = 0;
  while (j < order.length) {
    const day = Math.floor(preds[order[j]].t / DAY);
    let k = j;
    while (k < order.length && Math.floor(preds[order[k]].t / DAY) === day) k++;
    const tops = new Map<string, Set<string>>();
    for (let x = j; x < k; x++) {
      const p = preds[order[x]];
      if (!tops.has(p.d)) tops.set(p.d, top(p.d));
      home[order[x]] = tops.get(p.d)!.has(p.h);
      away[order[x]] = tops.get(p.d)!.has(p.a);
    }
    for (let x = j; x < k; x++) {
      const p = preds[order[x]];
      push(`${p.d}|${p.h}`, p.dc[0] - p.dc[1]);
      push(`${p.d}|${p.a}`, p.dc[1] - p.dc[0]);
    }
    j = k;
  }
  return { home, away };
}

/** Which side a selection backs, if any. */
function backs(key: string): "home" | "away" | null {
  if (/^(1x2:home|dc:home-draw|ah:home)/.test(key) || /^(corners|shots|sot):(most:home|hcp:home)/.test(key)) return "home";
  if (/^(1x2:away|dc:away-draw|ah:away)/.test(key) || /^(corners|shots|sot):(most:away|hcp:away)/.test(key)) return "away";
  return null;
}

/** Goal selections a KiqStat pick may carry today: no draw, no both-score, no paused unders, no team goals, handicaps from the full model below. */
const SHIP_GOAL_KEYS = GOAL_KEYS.filter((k) => /^(1x2:(home|away)|dc:|ou:over:)/.test(k));

/** Every Asian line the site shows, named as predictions_log stores them; whole lines can push. */
const AH_LINES_ALL = [-2.5, -2, -1.5, -1, 0, 1, 1.5, 2, 2.5];
const PUSH = 2;

/** Handicap selections from a grid: probability = chance of a win against a loss (a push is neither), wins 1/0, or PUSH. */
function handicapModel(preds: Pred[], grids: Grid[]): Model {
  const keys = AH_LINES_ALL.flatMap((l) => [`ah:home:${l}`, `ah:away:${l === 0 ? 0 : -l}`]);
  const probs = grids.map((g) => {
    const out: number[] = [];
    for (const l of AH_LINES_ALL) {
      let hw = 0, aw = 0;
      g.forEach((row, x) => row.forEach((p, y) => {
        const m = x - y + l;
        if (m > 0) hw += p; else if (m < 0) aw += p;
      }));
      // A whole line can push: its fair price, and so its chance, is win against loss.
      if (Number.isInteger(l)) out.push(hw / (hw + aw), aw / (hw + aw));
      else out.push(hw, aw);
    }
    return Float64Array.from(out);
  });
  const wins = preds.map((p) => {
    const out: number[] = [];
    for (const l of AH_LINES_ALL) {
      const m = p.hg - p.ag + l;
      out.push(m > 0 ? 1 : m < 0 ? 0 : PUSH, m < 0 ? 1 : m > 0 ? 0 : PUSH);
    }
    return Uint8Array.from(out);
  });
  return { name: "dc", keys, probs, wins };
}

interface ShipRule {
  key: string;
  model: Model;
  k: number;
  threshold: number;
  tuneHit: number;
  tuneN: number;
}

const decided = (x: Sel) => x.w !== PUSH;

/** The lowest threshold whose record reaches the target with minN decided picks (pushes left out). */
function ruleOn(m: Model, preds: Pred[], k: number, target: number, minN: number, all: boolean): ShipRule | null {
  const sel = (all ? [...selections(m, preds, k, false), ...selections(m, preds, k, true)] : selections(m, preds, k, false)).filter(decided);
  for (let t = 0.5; t <= PMAX - 0.02; t += 0.01) {
    const pool = sel.filter((x) => x.p >= t && x.p <= PMAX);
    if (pool.length < minN) return null;
    const hit = pool.reduce((a, x) => a + x.w, 0) / pool.length;
    if (hit >= target) return { key: m.keys[k], model: m, k, threshold: Math.round(t * 100) / 100, tuneHit: hit, tuneN: pool.length };
  }
  return null;
}

/** A rule's holdout record. */
function held(r: ShipRule, preds: Pred[]) {
  const sel = selections(r.model, preds, r.k, true).filter((x) => x.p >= r.threshold && x.p <= PMAX);
  const dec = sel.filter(decided);
  return { n: dec.length, pushes: sel.length - dec.length, hit: dec.reduce((a, x) => a + x.w, 0) / Math.max(1, dec.length), stated: dec.reduce((a, x) => a + x.p, 0) / Math.max(1, dec.length) };
}

const LABEL: Record<string, string> = { corners: "corners", shots: "shots", sot: "shots on target" };
function plain(key: string): string {
  const [f, a, b, c] = key.split(":");
  if (f === "ah") return `${a} ${Number(b) > 0 ? "+" : ""}${b} handicap`;
  if (!(f in LABEL)) return key;
  const what = LABEL[f];
  if (a === "over" || a === "under") return `${a} ${b} ${what}`;
  if (a === "most") return `most ${what}: ${b}`;
  if (a === "hcp") return `${b} ${c} ${what} handicap`;
  return `${a} team ${b} ${c} ${what}`;
}

/**
 * What the site could publish with only the maths it runs today: the live
 * goals model for result, double chance, overs and every Asian line, the live
 * count model for corners, shots and shots on target. Rules chosen on 2024-25,
 * scored on 2025-26. Rules sit in tiers: a game takes the strongest rule of the
 * first tier that has one, and a game no rule covers keeps today's pick.
 */
function shippable(preds: Pred[], dc: Model, grids: Grid[], nbs: Model[], wins: Uint8Array[], holdWeeks: number) {
  console.log("\n10. SHIPPABLE KIQSTAT PICK: live goals model + live count model only, every league, rules from 2024-25, scored on 2025-26");
  const ah = handicapModel(preds, grids);
  const pubSel = (i: number): { p: number; w: number; key: string } | null => {
    const pub = preds[i].pub;
    if (!pub) return null;
    const k = GOAL_KEYS.indexOf(pub[0]);
    return k < 0 ? null : { p: pub[1], w: wins[i][k], key: pub[0] };
  };
  const rulesFor = (m: Model, keys: string[], target: number, all: boolean) => keys.map((key) => ruleOn(m, preds, m.keys.indexOf(key), target, 100, all)).filter((r): r is ShipRule => r !== null);
  const goalRules = (target: number, all = false) => [...rulesFor(dc, SHIP_GOAL_KEYS, target, all), ...rulesFor(ah, ah.keys, target, all)];
  const statRules = (prefix: string, target: number, all = false) => nbs.filter((m) => m.keys[0].startsWith(prefix)).flatMap((m) => rulesFor(m, m.keys, target, all));
  const groupOf = (key: string) => (key.startsWith("corners") ? "corners" : key.startsWith("shots") ? "shots" : key.startsWith("sot") ? "shots on target" : group(key));

  type Picked = { i: number; p: number; w: number; key: string; fallback: boolean };
  const big = bigFlags(preds);
  /** Backs the side a big club is playing against: the model under-rates big clubs. */
  const againstBig = (i: number, key: string) => {
    const side = backs(key);
    return side === "home" ? big.away[i] && !big.home[i] : side === "away" ? big.home[i] && !big.away[i] : false;
  };
  let guard = false;
  const pickFor = (i: number, tiers: ShipRule[][]): Picked | null => {
    for (const tier of tiers) {
      let best: { r: ShipRule; p: number } | null = null;
      for (const r of tier) {
        if (guard && againstBig(i, r.key)) continue;
        const pr = r.model.probs[i];
        if (!pr || !r.model.wins[i]) continue;
        const p = pr[r.k];
        if (p < r.threshold || p > PMAX) continue;
        if (!best || r.tuneHit > best.r.tuneHit || (r.tuneHit === best.r.tuneHit && p > best.p)) best = { r, p };
      }
      if (best) return { i, p: best.p, w: best.r.model.wins[i]![best.r.k], key: best.r.key, fallback: false };
    }
    const f = pubSel(i);
    return f ? { i, ...f, fallback: true } : null;
  };
  const slate = (label: string, tiers: ShipRule[][], hold = true, quiet = false) => {
    const all: Picked[] = [];
    preds.forEach((pred, i) => {
      if (isHold(pred) !== hold) return;
      const x = pickFor(i, tiers);
      if (x) all.push(x);
    });
    const picks = all.filter((x) => x.w !== PUSH);
    const n = picks.length, w = picks.reduce((a, x) => a + x.w, 0), st = picks.reduce((a, x) => a + x.p, 0);
    const c = consistency(picks.map((x) => ({ i: x.i, p: x.p, w: x.w })), preds);
    if (quiet) return picks;
    console.log(`  ${label.padEnd(52)} ${String(n).padStart(5)} picks  landed ${pct(w / n)}  stated ${pct(st / n)}  pushes ${all.length - n}  median week ${pct(c.median)}  worst 10% ${pct(c.p10)}  weeks>=75% ${pct(c.atLeast75)}  worst run ${c.worstRun}  price ~${(n / st).toFixed(2)}`);
    const by = new Map<string, { n: number; w: number; st: number }>();
    for (const x of picks) {
      const g = x.fallback ? "today's pick (no rule)" : groupOf(x.key);
      const b = by.get(g) ?? { n: 0, w: 0, st: 0 };
      b.n++; b.w += x.w; b.st += x.p;
      by.set(g, b);
    }
    console.log(`      ${[...by].sort((a, b) => b[1].n - a[1].n).map(([g, b]) => `${g} ${b.n} @ ${pct(b.w / b.n)} (stated ${pct(b.st / b.n)})`).join("; ")}`);
    return picks;
  };

  /* Every Asian line on its own. */
  console.log("\n  ASIAN HANDICAP, EVERY LINE: the lowest chance that reached 80/82/85% in 2024-25, and that rule on 2025-26 (pushes left out)");
  for (const key of ah.keys) {
    const parts: string[] = [];
    for (const target of [0.8, 0.82, 0.85]) {
      const r = ruleOn(ah, preds, ah.keys.indexOf(key), target, 100, false);
      if (!r) { parts.push(`${Math.round(target * 100)}%: none`); continue; }
      const h = held(r, preds);
      parts.push(`${Math.round(target * 100)}%: from ${r.threshold.toFixed(2)} -> ${pct(h.hit)} of ${h.n} (${(h.n / holdWeeks).toFixed(1)}/wk, stated ${pct(h.stated)}, ${h.pushes} pushes)`);
    }
    console.log(`  ${plain(key).padEnd(22)} ${parts.join("   ")}`);
  }

  /* Every corners, shots and on-target variant on its own. */
  for (const prefix of ["corners", "shots:", "sot"]) {
    console.log(`\n  ${prefix.replace(":", "").toUpperCase()}: every rule that held 82%+ in 2024-25, on 2025-26`);
    const rules = statRules(prefix, 0.82).map((r) => ({ r, h: held(r, preds) })).filter((x) => x.h.n >= 30).sort((a, b) => b.h.n - a.h.n);
    for (const { r, h } of rules) console.log(`    ${plain(r.key).padEnd(38)} from ${r.threshold.toFixed(2)}  ${pct(h.hit)} of ${String(h.n).padStart(5)}  ${(h.n / holdWeeks).toFixed(1).padStart(5)}/wk  stated ${pct(h.stated)}`);
  }

  /* KiqStat pick candidates. */
  console.log("\n  KIQSTAT PICK SLATES (2025-26, one pick per game; guard = never back the side a big club is playing)");
  slate("today's pick", []);
  const g82 = goalRules(0.82);
  const halfOnly = g82.filter((r) => !/^ah:(home|away):-?\d+$/.test(r.key));
  console.log(`  goal rules at 82%: ${g82.map((r) => `${r.key} ${r.threshold.toFixed(2)}`).join(", ")}`);
  const c85 = statRules("corners", 0.85), s85 = statRules("shots:", 0.85), t85 = statRules("sot", 0.85);
  const validated = (rs: ShipRule[]) => rs.filter((r) => { const h = held(r, preds); return h.n >= 100 && h.hit >= 0.82; });
  const c85v = validated(c85), s85v = validated(s85), t85v = validated(t85);
  console.log(`  stat rules at 85%: corners ${c85.length} (${c85v.length} held 82%+ on 2025-26), shots ${s85.length} (${s85v.length}), on target ${t85.length} (${t85v.length})`);
  for (const r of [...c85, ...t85, ...s85]) {
    const h = held(r, preds);
    const ok = h.n >= 100 && h.hit >= 0.82;
    console.log(`    ${ok ? "HELD" : "    "} { market: "${r.key}", min: ${r.threshold.toFixed(2)}, record: ${r.tuneHit.toFixed(3)} },  // 2024-25 ${r.tuneN} picks; 2025-26 ${pct(h.hit)} of ${h.n}`);
  }
  for (const g of [false, true]) {
    guard = g;
    console.log(`  ${g ? "WITH" : "WITHOUT"} THE BIG-CLUB GUARD`);
    slate("result, dc, over 1.5, half-goal handicaps (live today)", [halfOnly]);
    slate("+ whole-line handicaps (+1, +2, draw no bet)", [g82]);
    slate("+ corners competing", [[...g82, ...c85]]);
    slate("+ corners and on target competing", [[...g82, ...c85, ...t85]]);
    slate("+ corners, on target, shots competing", [[...g82, ...c85, ...t85, ...s85]]);
    slate("+ corners competing, then on target and shots", [[...g82, ...c85], [...t85, ...s85]]);
    slate("+ held-up stat rules only, competing", [[...g82, ...c85v, ...t85v, ...s85v]]);
    slate("+ held-up corners competing, then held-up on target and shots", [[...g82, ...c85v], [...t85v, ...s85v]]);
  }
  guard = true;
  slate("2024-25 check: + corners and on target competing, guard", [[...g82, ...c85, ...t85]], false);
  guard = false;

  /* Production rules, refitted on both seasons. */
  const prodGoal = goalRules(0.82, true).sort((a, b) => b.tuneHit - a.tuneHit);
  console.log(`\n  PRODUCTION GOAL RULES at 82% (both seasons): ${prodGoal.length}`);
  for (const r of prodGoal) {
    const tune = ruleOn(r.model, preds, r.k, 0.82, 100, false);
    console.log(`    { market: "${r.key}", min: ${r.threshold.toFixed(2)}, record: ${r.tuneHit.toFixed(3)} },  // ${r.tuneN} picks${tune ? `; 2024-25 rule ${tune.threshold.toFixed(2)}` : "; no 2024-25 rule"}`);
  }
  for (const prefix of ["corners", "shots:", "sot"]) {
    const prod = statRules(prefix, 0.85, true).sort((a, b) => b.tuneHit - a.tuneHit);
    console.log(`  PRODUCTION ${prefix.replace(":", "").toUpperCase()} RULES at 85% (both seasons): ${prod.length}`);
    for (const r of prod) {
      const tune = ruleOn(r.model, preds, r.k, 0.85, 100, false);
      console.log(`    { market: "${r.key}", min: ${r.threshold.toFixed(2)}, record: ${r.tuneHit.toFixed(3)} },  // ${r.tuneN} picks${tune ? `; 2024-25 rule ${tune.threshold.toFixed(2)}` : "; no 2024-25 rule"}`);
    }
  }

  guard = true;
  bias(preds, grids, slate("", [[...g82, ...c85, ...t85]], true, true), big);
}

/* ------------------------------------------------------- 11. big teams */

/**
 * Does the model lean toward big clubs, or miss upsets? Big = the top three
 * of each division and season by the model's own average expected goal
 * difference. Every 2025-26 game, stated against what happened.
 */
function bias(preds: Pred[], grids: Grid[], picks: { i: number; p: number; w: number; key: string }[], pre: { home: boolean[]; away: boolean[] }) {
  console.log("\n11. BIG TEAMS AND UPSETS (2025-26)");
  const season = (t: number) => new Date(t - 182 * DAY).getUTCFullYear();
  const strength = new Map<string, { s: number; n: number }>();
  preds.forEach((p) => {
    const gd = p.dc[0] - p.dc[1];
    for (const [team, v] of [[p.h, gd], [p.a, -gd]] as [string, number][]) {
      const k = `${p.d}|${season(p.t)}|${team}`;
      const b = strength.get(k) ?? { s: 0, n: 0 };
      b.s += v; b.n++;
      strength.set(k, b);
    }
  });
  const big = new Set<string>();
  const groups = new Map<string, { team: string; s: number }[]>();
  for (const [k, b] of strength) {
    const [d, y, team] = k.split("|");
    const g = groups.get(`${d}|${y}`) ?? [];
    g.push({ team, s: b.s / b.n });
    groups.set(`${d}|${y}`, g);
  }
  for (const [dy, g] of groups) g.sort((a, b) => b.s - a.s).slice(0, 3).forEach((x) => big.add(`${dy}|${x.team}`));
  const isBig = (p: Pred, team: string) => big.has(`${p.d}|${season(p.t)}|${team}`);

  const tally = () => ({ n: 0, st: 0, w: 0 });
  type T = ReturnType<typeof tally>;
  const add = (t: T, st: number, w: boolean) => { t.n++; t.st += st; t.w += Number(w); };
  const line = (label: string, t: T) => console.log(`  ${label.padEnd(58)} ${String(t.n).padStart(5)} games  stated ${pct(t.st / Math.max(1, t.n))}  happened ${pct(t.w / Math.max(1, t.n))}  gap ${((100 * (t.w - t.st)) / Math.max(1, t.n)).toFixed(1)}`);
  const bigWin = tally(), bigWinHome = tally(), bigWinAway = tally(), bigFav = tally(), bigUpset = tally(), otherFav = tally(), otherUpset = tally();
  const favBands = [0.45, 0.55, 0.65, 0.75, 1.01].map(() => ({ fav: tally(), dog: tally(), draw: tally() }));
  preds.forEach((p, i) => {
    if (!isHold(p)) return;
    const g = grids[i];
    let h = 0, d = 0, a = 0;
    g.forEach((row, x) => row.forEach((q, y) => { if (x > y) h += q; else if (x === y) d += q; else a += q; }));
    const homeWon = p.hg > p.ag, awayWon = p.ag > p.hg, drew = p.hg === p.ag;
    const favHome = h >= a;
    const fav = favHome ? h : a, dog = favHome ? a : h;
    const favWon = favHome ? homeWon : awayWon, dogWon = favHome ? awayWon : homeWon;
    const band = favBands[[0.45, 0.55, 0.65, 0.75, 1.01].findIndex((b) => fav < b)];
    add(band.fav, fav, favWon); add(band.dog, dog, dogWon); add(band.draw, d, drew);
    const hb = isBig(p, p.h), ab = isBig(p, p.a);
    if (hb !== ab) {
      const bigHome = hb;
      const pw = bigHome ? h : a, won = bigHome ? homeWon : awayWon;
      add(bigWin, pw, won);
      add(bigHome ? bigWinHome : bigWinAway, pw, won);
      if (pw >= 0.6) { add(bigFav, pw, won); add(bigUpset, bigHome ? a : h, bigHome ? awayWon : homeWon); }
    } else if (!hb && !ab && fav >= 0.6) {
      add(otherFav, fav, favWon); add(otherUpset, dog, dogWon);
    }
  });
  console.log("  By how big the favourite was:");
  ["under 45%", "45-55%", "55-65%", "65-75%", "75%+"].forEach((label, j) => {
    const b = favBands[j];
    console.log(`    favourite rated ${label.padEnd(9)} favourite won ${pct(b.fav.w / Math.max(1, b.fav.n))} (said ${pct(b.fav.st / Math.max(1, b.fav.n))})   underdog won ${pct(b.dog.w / Math.max(1, b.dog.n))} (said ${pct(b.dog.st / Math.max(1, b.dog.n))})   draw ${pct(b.draw.w / Math.max(1, b.draw.n))} (said ${pct(b.draw.st / Math.max(1, b.draw.n))})   ${b.fav.n} games`);
  });
  line("big club against a smaller one: big club wins", bigWin);
  line("  at home", bigWinHome);
  line("  away", bigWinAway);
  line("big club rated 60%+: big club wins", bigFav);
  line("big club rated 60%+: the smaller side wins (upset)", bigUpset);
  line("two smaller clubs, favourite 60%+: favourite wins", otherFav);
  line("two smaller clubs, favourite 60%+: underdog wins (upset)", otherUpset);

  // The same with big clubs as known before kick-off (rolling form, no look-ahead).
  const preWin = tally(), preUpset = tally();
  preds.forEach((p, i) => {
    if (!isHold(p) || pre.home[i] === pre.away[i]) return;
    let h = 0, a = 0;
    grids[i].forEach((row, x) => row.forEach((q, y) => { if (x > y) h += q; else if (x < y) a += q; }));
    const bigHome = pre.home[i];
    add(preWin, bigHome ? h : a, bigHome ? p.hg > p.ag : p.ag > p.hg);
    add(preUpset, bigHome ? a : h, bigHome ? p.ag > p.hg : p.hg > p.ag);
  });
  line("big club by pre-match form vs a smaller one: big club wins", preWin);
  line("big club by pre-match form vs a smaller one: smaller side wins", preUpset);

  // The KiqStat pick: does it lean on big clubs, and do those picks land?
  const pBig = tally(), pSmallVsBig = tally(), pOther = tally(), pNeutral = tally();
  for (const x of picks) {
    const side = backs(x.key);
    if (!side) { add(pNeutral, x.p, x.w === 1); continue; }
    const mine = side === "home" ? pre.home[x.i] : pre.away[x.i], theirs = side === "home" ? pre.away[x.i] : pre.home[x.i];
    if (mine && !theirs) add(pBig, x.p, x.w === 1);
    else if (!mine && theirs) add(pSmallVsBig, x.p, x.w === 1);
    else add(pOther, x.p, x.w === 1);
  }
  console.log("  The KiqStat pick (goals, handicaps, corners and on target, with the guard):");
  line("backs a big club against a smaller one", pBig);
  line("backs the smaller side against a big club", pSmallVsBig);
  line("backs a side, no big club or both big", pOther);
  line("backs no side (goals, corners, shots)", pNeutral);
}
