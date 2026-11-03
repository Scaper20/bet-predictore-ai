/**
 * Research: is the player-props model (src/lib/model/player-props.ts) good
 * enough to publish, market by market? Nothing here changes the site unless
 * --ship is passed, which rewrites src/lib/model/player-props-params.ts.
 *
 * Input: .backtest-cache/props-games.json (scripts/props-export.ts).
 *
 * Walk-forward, strictly before kickoff: every starter's game is predicted
 * from that player's earlier games, the opponent's earlier games and the
 * position averages up to the day before. Only starters with 5+ earlier starts
 * are scored (props are published once the eleven is confirmed).
 *
 *   warm-up     before 2025-01-01, not scored
 *   validation  2025-01-01 .. 2025-06-30: picks each market's parameters
 *               (grid), fits the negative binomial size per position and the
 *               probability calibration
 *   test        2025-07-01 onwards: reported, never used for fitting
 *
 * Baseline: Poisson on the player's plain average over his last ten starts.
 * Scores: log score of the observed count; log loss and Brier of over/under
 * at every half-line the baseline puts between 10% and 90% (the lines a
 * bookmaker would list); calibration by probability band; a match-clustered
 * bootstrap interval for the log-loss gain.
 *
 * Go: the gain's 95% interval is above zero, calibration error on test is
 * under 2.5 points, and the 70%+ bands hit within 3 points of what they say.
 *
 *   npx tsx scripts/props-lab.ts            (report to .backtest-cache/props-report.md)
 *   npx tsx scripts/props-lab.ts --ship     (also writes the fitted parameters)
 */

import fs from "node:fs";
import path from "node:path";
import { nbPmf } from "../src/lib/model/match-stats";
import {
  calibrate, logScore, overProb, PROP_MARKETS, PROP_SPECS, project, propValue,
  type ConcededGame, type PositionCode, type PositionPriors, type PropGame, type PropMarketKey, type PropParams,
} from "../src/lib/model/player-props";

const CACHE = path.join(process.cwd(), ".backtest-cache");
const VAL_FROM = Date.UTC(2025, 0, 1);
const TEST_FROM = Date.UTC(2025, 6, 1);
const MIN_STARTS = 5;
/** Opponent factor against each player's usual output (default) or the plain position average (--opp=plain). */
const EXPECTED = !process.argv.includes("--opp=plain");
/** Pseudo-90s of position average in a player's usual rate, for "expected". */
const OWN_K = 5;
const DAY = 86_400_000;

interface Raw {
  p: string; pos: number | null; m: string; t: number; lg: string; h: number; tm: string; op: string;
  st: number; min: number; g: number; a: number; sh: number; sot: number; xg: number | null; xa: number | null;
  tk: number | null; cl: number | null; fc: number | null; pa: number | null; sv: number | null;
}

interface Instance {
  m: string; t: number; pos: PositionCode;
  hist: PropGame[]; conc: ConcededGame[]; priors: PositionPriors;
  y: Record<PropMarketKey, number>;
  base: Record<PropMarketKey, number>;
}

const STAT_KEYS = [...PROP_MARKETS, "xg", "xa"] as const;

function toGame(r: Raw): PropGame {
  return {
    t: r.t, min: r.min, started: r.st === 1, g: r.g, a: r.a, sh: r.sh, sot: r.sot,
    xg: r.xg ?? 0, xa: r.xa ?? 0, tk: r.tk ?? 0, cl: r.cl ?? 0, fc: r.fc ?? 0, pa: r.pa ?? 0, sv: r.sv ?? 0,
  };
}

function build(rows: Raw[]): Instance[] {
  rows.sort((a, b) => a.t - b.t);
  const hist = new Map<string, PropGame[]>();
  const conc = new Map<string, ConcededGame[]>();
  // running position totals for the priors
  const tot: Record<number, Record<string, number>> = {};
  for (const pos of [0, 1, 2, 3]) tot[pos] = Object.fromEntries([...STAT_KEYS.map((k) => [k, 0]), ["n90", 0]]);
  const snapshot = (): PositionPriors => {
    const out = {} as PositionPriors;
    for (const pos of [0, 1, 2, 3] as PositionCode[]) {
      const n = Math.max(1, tot[pos].n90);
      out[pos] = Object.fromEntries(STAT_KEYS.map((k) => [k, tot[pos][k] / n])) as PositionPriors[PositionCode];
    }
    return out;
  };

  // Each player's running totals (all earlier games), for the opponent factor's "expected".
  const rates = new Map<string, Record<PropMarketKey | "n90", number>>();
  const out: Instance[] = [];
  let i = 0;
  while (i < rows.length) {
    const day = Math.floor(rows[i].t / DAY);
    let j = i;
    while (j < rows.length && Math.floor(rows[j].t / DAY) === day) j++;
    const dayRows = rows.slice(i, j);
    const priors = snapshot();
    const priorsNow = priors;
    const warm = rows[i].t >= VAL_FROM - 120 * DAY; // instances only needed from shortly before validation

    if (warm) {
      for (const r of dayRows) {
        if (!r.st || r.pos === null) continue;
        const h = hist.get(r.p) ?? [];
        const starts = h.filter((g) => g.started);
        if (starts.length < MIN_STARTS) continue;
        const g = toGame(r);
        const last10 = starts.slice(-10);
        const base = Object.fromEntries(PROP_MARKETS.map((m) => [m, last10.reduce((s, x) => s + propValue(x, m), 0) / last10.length])) as Record<PropMarketKey, number>;
        out.push({
          m: r.m, t: r.t, pos: r.pos as PositionCode,
          hist: h.slice(-120),
          conc: (conc.get(`${r.op}|${r.pos}`) ?? []).slice(-80),
          priors,
          y: Object.fromEntries(PROP_MARKETS.map((m) => [m, propValue(g, m)])) as Record<PropMarketKey, number>,
          base,
        });
      }
    }

    // then let the day's games into the history
    const agg = new Map<string, ConcededGame>();
    for (const r of dayRows) {
      const g = toGame(r);
      // The player's usual output in these minutes, from his games before this one.
      const own = rates.get(r.p);
      const list = hist.get(r.p);
      if (list) list.push(g); else hist.set(r.p, [g]);
      if (r.pos === null) continue;
      const key = `${r.op}|${r.pos}|${r.m}`;
      const zero = () => Object.fromEntries(PROP_MARKETS.map((m) => [m, 0])) as Record<PropMarketKey, number>;
      const c = agg.get(key) ?? { t: r.t, min: 0, y: zero(), ...(EXPECTED ? { e: zero() } : {}) };
      c.min += r.min;
      for (const m of PROP_MARKETS) {
        c.y[m] += propValue(g, m);
        if (c.e) {
          const pri = priorsNow[r.pos as PositionCode][m];
          const rate = ((own?.[m] ?? 0) + OWN_K * pri) / ((own?.n90 ?? 0) + OWN_K);
          c.e[m] += (rate * r.min) / 90;
        }
      }
      agg.set(key, c);
      if (r.min >= 15) {
        const o = own ?? (Object.fromEntries([...PROP_MARKETS.map((m) => [m, 0]), ["n90", 0]]) as Record<PropMarketKey | "n90", number>);
        for (const m of PROP_MARKETS) o[m] += propValue(g, m);
        o.n90 += r.min / 90;
        rates.set(r.p, o);
      }
      if (r.min >= 15) {
        const tp = tot[r.pos];
        for (const k of STAT_KEYS) tp[k] += k === "xg" ? g.xg : k === "xa" ? g.xa : propValue(g, k as PropMarketKey);
        tp.n90 += r.min / 90;
      }
    }
    for (const [key, c] of agg) {
      const k = key.slice(0, key.lastIndexOf("|"));
      const list = conc.get(k);
      if (list) list.push(c); else conc.set(k, [c]);
    }
    i = j;
  }
  return out;
}

interface Pred { inst: Instance; mean: number }

function predict(insts: Instance[], m: PropMarketKey, p: PropParams): Pred[] {
  const out: Pred[] = [];
  for (const inst of insts) {
    if (PROP_SPECS[m].keepers !== (inst.pos === 0)) continue;
    const pr = project({ market: m, position: inst.pos, history: inst.hist, conceded: inst.conc, now: inst.t, priors: inst.priors, params: p });
    if (pr) out.push({ inst, mean: pr.mean });
  }
  return out;
}

/** Method-of-moments NB size per position from predictions on a window. */
function fitSize(preds: Pred[], m: PropMarketKey): Record<PositionCode, number> {
  const size = { 0: Infinity, 1: Infinity, 2: Infinity, 3: Infinity } as Record<PositionCode, number>;
  for (const pos of [0, 1, 2, 3] as PositionCode[]) {
    let mu2 = 0, ex = 0, n = 0;
    for (const q of preds) {
      if (q.inst.pos !== pos) continue;
      const y = q.inst.y[m];
      mu2 += q.mean * q.mean;
      ex += (y - q.mean) ** 2 - q.mean;
      n++;
    }
    if (n >= 200 && ex > 0) size[pos] = Math.max(0.5, mu2 / ex);
  }
  return size;
}

function meanLogScore(preds: Pred[], m: PropMarketKey, size: Record<PositionCode, number>): number {
  let s = 0;
  for (const q of preds) s += logScore(q.mean, size[q.inst.pos], q.inst.y[m]);
  return s / Math.max(1, preds.length);
}

function poissonLog(mean: number, y: number): number {
  const pmf = nbPmf(Math.max(0.001, mean), Infinity, y);
  return Math.log(Math.max(1e-12, pmf[y]));
}

/** Over/under scoring rows at the lines a book would plausibly list. */
interface LineRow { m: string; line: number; over: boolean; pModel: number; pBase: number }

function lineRows(preds: Pred[], m: PropMarketKey, size: Record<PositionCode, number>): LineRow[] {
  const out: LineRow[] = [];
  const step = PROP_SPECS[m].step;
  for (const q of preds) {
    const b = Math.max(0.001, q.inst.base[m]);
    const start = step === 1 ? 0.5 : Math.max(0.5, Math.floor(b / 5) * 5 - 25 + 4.5);
    for (let line = start; line <= b * 3 + 6; line += step) {
      const pBase = overProb(b, Infinity, line);
      if (pBase < 0.1 || pBase > 0.9) continue;
      out.push({ m: q.inst.m, line, over: q.inst.y[m] > line, pModel: overProb(q.mean, size[q.inst.pos], line), pBase });
    }
  }
  return out;
}

const ll = (p: number, y: boolean) => -Math.log(Math.max(1e-9, y ? p : 1 - p));

function fitCalibration(rows: LineRow[]): number {
  let best = 1, bestLoss = Infinity;
  for (let a = 0.5; a <= 1.5001; a += 0.02) {
    let s = 0;
    for (const r of rows) s += ll(calibrate(r.pModel, a), r.over);
    if (s < bestLoss) {
      bestLoss = s;
      best = Math.round(a * 100) / 100;
    }
  }
  return best;
}

function bootstrapGain(rows: LineRow[], a: number, reps = 300): [number, number, number] {
  const byMatch = new Map<string, { gain: number; n: number }>();
  for (const r of rows) {
    const e = byMatch.get(r.m) ?? { gain: 0, n: 0 };
    e.gain += ll(r.pBase, r.over) - ll(calibrate(r.pModel, a), r.over);
    e.n++;
    byMatch.set(r.m, e);
  }
  const ms = [...byMatch.values()];
  const tg = ms.reduce((s, e) => s + e.gain, 0), tn = ms.reduce((s, e) => s + e.n, 0);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const draws: number[] = [];
  for (let k = 0; k < reps; k++) {
    let g = 0, n = 0;
    for (let i = 0; i < ms.length; i++) {
      const e = ms[Math.floor(rand() * ms.length)];
      g += e.gain;
      n += e.n;
    }
    draws.push(g / n);
  }
  draws.sort((x, y) => x - y);
  return [tg / tn, draws[Math.floor(reps * 0.025)], draws[Math.floor(reps * 0.975)]];
}

const BANDS: [number, number][] = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.78], [0.78, 0.85], [0.85, 0.9], [0.9, 1.01]];

function bands(rows: LineRow[], a: number) {
  return BANDS.map(([lo, hi]) => {
    let n = 0, sp = 0, hit = 0;
    for (const r of rows) {
      const p = calibrate(r.pModel, a);
      const side = p >= 0.5;
      const conf = side ? p : 1 - p;
      if (conf < lo || conf >= hi) continue;
      n++;
      sp += conf;
      if (side === r.over) hit++;
    }
    return { lo, hi, n, pred: n ? sp / n : 0, hit: n ? hit / n : 0 };
  });
}

function ece(rows: LineRow[], a: number): number {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const r of rows) {
    const p = calibrate(r.pModel, a);
    const b = bins[Math.min(9, Math.floor(p * 10))];
    b.n++;
    b.p += p;
    b.y += r.over ? 1 : 0;
  }
  const n = rows.length || 1;
  return bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
}

const GRID = {
  halfLife: [90, 180, 365, 730],
  k: [2, 5, 10, 20],
  oppK: [0, 10, 30, 60],
  blend: [0, 0.5, 0.8],
};

interface MarketResult {
  market: PropMarketKey;
  params: PropParams;
  calibration: number;
  nVal: number; nTest: number; nLines: number;
  logScore: { model: number; base: number };
  lineLoss: { model: number; base: number };
  brier: { model: number; base: number };
  gain: [number, number, number];
  ece: number;
  bands: ReturnType<typeof bands>;
  go: boolean;
  why: string;
}

function evaluate(insts: Instance[], m: PropMarketKey): MarketResult {
  const val = (ps: Pred[]) => ps.filter((q) => q.inst.t >= VAL_FROM && q.inst.t < TEST_FROM);
  const test = (ps: Pred[]) => ps.filter((q) => q.inst.t >= TEST_FROM);
  const blends = m === "goals" || m === "assists" || m === "goalsAssists" ? GRID.blend : [0];
  let best: { p: PropParams; score: number } | null = null;
  for (const halfLife of GRID.halfLife)
    for (const k of GRID.k)
      for (const oppK of GRID.oppK)
        for (const blend of blends) {
          const p: PropParams = { halfLife, k, oppK, blend, size: { 0: Infinity, 1: Infinity, 2: Infinity, 3: Infinity } };
          const v = val(predict(insts, m, p));
          const size = fitSize(v, m);
          const score = meanLogScore(v, m, size);
          if (!best || score > best.score) best = { p: { ...p, size }, score };
        }
  const p = best!.p;
  const all = predict(insts, m, p);
  const v = val(all), t = test(all);
  const vRows = lineRows(v, m, p.size), tRows = lineRows(t, m, p.size);
  const a = fitCalibration(vRows);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const gain = bootstrapGain(tRows, a);
  const e = ece(tRows, a);
  const bs = bands(tRows, a);
  const bad = bs.filter((b) => b.lo >= 0.7 && b.n >= 200 && Math.abs(b.hit - b.pred) > 0.03);
  const why = gain[1] <= 0 ? "no clear gain over the plain average" : e > 0.025 ? "calibration off" : bad.length ? `bands ${bad.map((b) => `${Math.round(b.lo * 100)}%+`).join(", ")} miss` : "passes";
  return {
    market: m, params: p, calibration: a, nVal: v.length, nTest: t.length, nLines: tRows.length,
    logScore: { model: meanLogScore(t, m, p.size), base: mean(t.map((q) => poissonLog(q.inst.base[m], q.inst.y[m]))) },
    lineLoss: { model: mean(tRows.map((r) => ll(calibrate(r.pModel, a), r.over))), base: mean(tRows.map((r) => ll(r.pBase, r.over))) },
    brier: { model: mean(tRows.map((r) => (calibrate(r.pModel, a) - (r.over ? 1 : 0)) ** 2)), base: mean(tRows.map((r) => (r.pBase - (r.over ? 1 : 0)) ** 2)) },
    gain, ece: e, bands: bs, go: why === "passes", why,
  };
}

function report(results: MarketResult[], nInst: number): string {
  const f = (x: number, d = 4) => x.toFixed(d);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`Scored starters (5+ earlier starts): ${nInst}. Validation ${new Date(VAL_FROM).toISOString().slice(0, 10)} to ${new Date(TEST_FROM - DAY).toISOString().slice(0, 10)}, test from ${new Date(TEST_FROM).toISOString().slice(0, 10)}.`, "");
  lines.push("| Market | Test games | Lines | Log score model / avg | Line log loss model / avg | Gain (95% CI) | Brier model / avg | ECE | Verdict |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${PROP_SPECS[r.market].label} | ${r.nTest} | ${r.nLines} | ${f(r.logScore.model, 3)} / ${f(r.logScore.base, 3)} | ${f(r.lineLoss.model)} / ${f(r.lineLoss.base)} | ${f(r.gain[0])} (${f(r.gain[1])} to ${f(r.gain[2])}) | ${f(r.brier.model)} / ${f(r.brier.base)} | ${pct(r.ece)} | ${r.go ? "**go**" : `no: ${r.why}`} |`);
  }
  lines.push("", "### Hit rate by confidence band (test, calibrated)", "");
  lines.push("| Market | " + BANDS.map(([lo, hi]) => `${Math.round(lo * 100)}–${hi > 1 ? 100 : Math.round(hi * 100)}%`).join(" | ") + " |");
  lines.push("|---|" + BANDS.map(() => "---").join("|") + "|");
  for (const r of results) {
    lines.push(`| ${PROP_SPECS[r.market].label} | ` + r.bands.map((b) => (b.n ? `${pct(b.hit)} vs ${pct(b.pred)} (n ${b.n})` : "–")).join(" | ") + " |");
  }
  lines.push("", "### Fitted parameters", "");
  lines.push("| Market | Half-life (days) | k | Opponent k | xG blend | NB size GK / DF / MF / FW | Calibration a |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    const s = r.params.size;
    const sz = ([0, 1, 2, 3] as PositionCode[]).map((pos) => (Number.isFinite(s[pos]) ? s[pos].toFixed(1) : "Poisson")).join(" / ");
    lines.push(`| ${PROP_SPECS[r.market].label} | ${r.params.halfLife} | ${r.params.k} | ${r.params.oppK} | ${r.params.blend} | ${sz} | ${r.calibration} |`);
  }
  return lines.join("\n");
}

function ship(results: MarketResult[]) {
  const size = (s: Record<PositionCode, number>) => `{ 0: ${Number.isFinite(s[0]) ? +s[0].toFixed(2) : "Infinity"}, 1: ${Number.isFinite(s[1]) ? +s[1].toFixed(2) : "Infinity"}, 2: ${Number.isFinite(s[2]) ? +s[2].toFixed(2) : "Infinity"}, 3: ${Number.isFinite(s[3]) ? +s[3].toFixed(2) : "Infinity"} }`;
  const body = results.map((r) => `  ${r.market}: {
    params: { halfLife: ${r.params.halfLife}, k: ${r.params.k}, oppK: ${r.params.oppK}, blend: ${r.params.blend}, size: ${size(r.params.size)} },
    calibration: ${r.calibration},
    publish: ${r.go},
  },`).join("\n");
  const file = `// Written by scripts/props-lab.ts --ship (walk-forward backtest, see docs/props-backtest.md). Do not edit by hand.
import type { PropMarketKey, PropParams } from "./player-props";

export interface FittedMarket {
  params: PropParams;
  /** Logit scaling for over/under probabilities. */
  calibration: number;
  /** Passed its backtest gate: may be published (still behind the player_props switch). */
  publish: boolean;
}

export const PROP_FIT: Record<PropMarketKey, FittedMarket> = {
${body}
};
`;
  fs.writeFileSync(path.join(process.cwd(), "src/lib/model/player-props-params.ts"), file);
  console.log("wrote src/lib/model/player-props-params.ts");
}

function main() {
  const rows = JSON.parse(fs.readFileSync(path.join(CACHE, "props-games.json"), "utf8")) as Raw[];
  const insts = build(rows);
  console.log(`instances: ${insts.length}`);
  const only = process.argv.find((a) => a.startsWith("--market="))?.slice(9) as PropMarketKey | undefined;
  const results: MarketResult[] = [];
  for (const m of only ? [only] : PROP_MARKETS) {
    const t0 = Date.now();
    const r = evaluate(insts, m);
    results.push(r);
    console.log(`${m}: ${r.go ? "GO" : "no"} (${r.why}) gain ${r.gain.map((x) => x.toFixed(4)).join(" ")} ece ${(r.ece * 100).toFixed(1)}% [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  }
  const md = report(results, insts.filter((x) => x.t >= TEST_FROM).length);
  fs.writeFileSync(path.join(CACHE, "props-report.md"), md);
  console.log("\n" + md);
  if (process.argv.includes("--ship") && !only) ship(results);
}

main();
