/**
 * Research: can the "shape" goal markets get better?
 *
 * GG2+, goal ranges, exact total, odd/even, a goal in both halves and
 * second-half BTTS all scored under 1% skill over the base rate
 * (docs/stats-markets.md). They depend less on who is stronger and more on
 * the shape of the total-goals distribution, so this tests shape changes,
 * each walk-forward on matches before each matchday only:
 *
 *   base     the site's grid today (Dixon-Coles, independent halves)
 *   corr     a shared goal component c (bivariate Poisson): X = A + C, Y = B + C
 *   disp     total goals negative binomial with size k, split binomial
 *   shrink   expected total pulled toward the league's (power beta)
 *   blend    expected total = market^w × model^(1-w)
 *   market   expected total set from the closing over/under 2.5 price
 *   ceiling  expected goals solved from the closing 1X2 AND over/under prices
 *
 * "market" and "ceiling" use prices the site does not have live; they show
 * how much of the gap is information the model lacks, versus noise no one
 * can call. Scored against climatology, like the other labs.
 *
 *   npx tsx scripts/goal-shape-lab.ts --from=2223 --to=2627 --c=0.08 --k=40 --beta=0.7
 */

import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { scoreMatrix, poissonPmf } from "../src/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "../src/lib/model/halves";
import { nbPmf } from "../src/lib/model/match-stats";
import { deVig } from "../src/lib/model/backtest";
import { csv, DIVISIONS, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const SEASONS = ["1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"];
const N = 11;

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

type Grid = number[][];

/** Bivariate Poisson grid with shared component c (capped below both means). */
function bivariate(lam: number, mu: number, c: number): Grid {
  const cc = Math.min(c, 0.9 * Math.min(lam, mu));
  const a = lam - cc, b = mu - cc;
  const g: Grid = Array.from({ length: N }, () => new Array(N).fill(0));
  let z = 0;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    let p = 0;
    for (let k = 0; k <= Math.min(x, y); k++) p += poissonPmf(x - k, a) * poissonPmf(y - k, b) * poissonPmf(k, cc);
    g[x][y] = p;
    z += p;
  }
  for (const r of g) for (let j = 0; j < N; j++) r[j] /= z;
  return g;
}

/** Total negative binomial(lam+mu, k), split binomial(share). */
function dispersed(lam: number, mu: number, k: number): Grid {
  const tp = nbPmf(lam + mu, k, 2 * N);
  const s = lam / (lam + mu);
  const g: Grid = Array.from({ length: N }, () => new Array(N).fill(0));
  let z = 0;
  for (let n = 0; n < 2 * N; n++) {
    let c = 1;
    for (let h = 0; h <= n; h++) {
      if (h > 0) c = (c * (n - h + 1)) / h;
      const a = n - h;
      if (h < N && a < N) {
        const p = tp[n] * c * Math.pow(s, h) * Math.pow(1 - s, a);
        g[h][a] += p;
        z += p;
      }
    }
  }
  for (const r of g) for (let j = 0; j < N; j++) r[j] /= z;
  return g;
}

/** Expected total whose Poisson P(total > 2.5) matches p. */
function totalFromOver(p: number): number {
  let lo = 0.3, hi = 6;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    const over = 1 - Math.exp(-m) * (1 + m + (m * m) / 2);
    if (over < p) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** lam, mu matching market home-win share and total (coarse search). */
function solveMarket(pHome: number, pAway: number, total: number): [number, number] {
  let best: [number, number] = [total / 2, total / 2], err = Infinity;
  for (let s = 0.15; s <= 0.85; s += 0.005) {
    const g = scoreMatrix(total * s, total * (1 - s));
    let h = 0, a = 0;
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) { if (x > y) h += g[x][y]; else if (y > x) a += g[x][y]; }
    const e = (h - pHome) ** 2 + (a - pAway) ** 2;
    if (e < err) { err = e; best = [total * s, total * (1 - s)]; }
  }
  return best;
}

interface Probs { gg2: number; m13: number; m23: number; exact: number[]; odd: number; o25: number; btts: number; bothHalves: number; btts2h: number }

function fullProbs(g: Grid): Omit<Probs, "bothHalves" | "btts2h"> {
  let gg2 = 0, m13 = 0, m23 = 0, odd = 0, o25 = 0, btts = 0;
  const exact = new Array(7).fill(0);
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const p = g[x][y], t = x + y;
    if (x >= 2 && y >= 2) gg2 += p;
    if (t >= 1 && t <= 3) m13 += p;
    if (t >= 2 && t <= 3) m23 += p;
    if (t % 2) odd += p;
    if (t > 2.5) o25 += p;
    if (x > 0 && y > 0) btts += p;
    exact[Math.min(6, t)] += p;
  }
  return { gg2, m13, m23, exact, odd, o25, btts };
}

function halfProbs(lam: number, mu: number): { bothHalves: number; btts2h: number } {
  const { first, second } = halfGrids(lam, mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT, SITE_SECOND_HALF_TILT);
  const any = (g: Grid) => 1 - g[0][0];
  let b2 = 0;
  for (let x = 1; x < N; x++) for (let y = 1; y < N; y++) b2 += second[x][y];
  return { bothHalves: any(first) * any(second), btts2h: b2 };
}

const MARKETS = ["GG2+", "Multi 1-3", "Multi 2-3", "Exact total", "Odd", "Over 2.5", "BTTS", "Goal both halves", "BTTS 2H"] as const;
type M = (typeof MARKETS)[number];

class Score {
  n = 0; m = 0; c = 0;
  add(pm: number[], pc: number[], o: number) {
    this.n++;
    this.m += -Math.log(Math.max(1e-9, pm[o]));
    this.c += -Math.log(Math.max(1e-9, pc[o]));
  }
  skill() { return (1 - this.m / this.c) * 100; }
}

async function main() {
  const from = arg("from") ?? "2223", to = arg("to") ?? "2627";
  const c = Number(arg("c") ?? "0.08"), k = Number(arg("k") ?? "40"), beta = Number(arg("beta") ?? "0.7");
  const w = Number(arg("w") ?? "0.6");
  const variants = ["base", "corr", "disp", "shrink", "blend", "market", "ceiling"] as const;
  const sc: Record<string, Record<M, Score>> = Object.fromEntries(variants.map((v) => [v, Object.fromEntries(MARKETS.map((m) => [m, new Score()])) as Record<M, Score>]));
  let priced = 0, total = 0;

  for (const div of Object.keys(DIVISIONS)) {
    const rows: Row[] = [];
    for (const s of SEASONS) { try { rows.push(...parse(await csv(s, div), div)); } catch { /* not published */ } }
    rows.sort((a, b) => a.date - b.date);
    const startOf = async (season: string) => parse(await csv(season, div), div)[0]?.date ?? Infinity;
    const lo = await startOf(from);
    const nextIdx = SEASONS.indexOf(to) + 1;
    const hi = nextIdx < SEASONS.length ? await startOf(SEASONS[nextIdx]).catch(() => Infinity) : Infinity;
    const target = rows.filter((r) => r.date >= lo && r.date < hi && r.htHome !== undefined && r.close && r.closeOu);

    let day = "";
    let prior: ReturnType<typeof toResultRow>[] = [];
    let prefit: ReturnType<typeof fitLeague> | undefined;
    let clim: Record<M, number[]> = {} as Record<M, number[]>;
    let leagueTotal = 2.7;

    const outcome = (r: Row): Record<M, number> => {
      const x = r.homeGoals, y = r.awayGoals, t = x + y, hx = r.htHome!, hy = r.htAway!;
      const b = (q: boolean) => (q ? 0 : 1);
      return {
        "GG2+": b(x >= 2 && y >= 2), "Multi 1-3": b(t >= 1 && t <= 3), "Multi 2-3": b(t >= 2 && t <= 3), "Exact total": Math.min(6, t),
        Odd: b(t % 2 === 1), "Over 2.5": b(t > 2.5), BTTS: b(x > 0 && y > 0), "Goal both halves": b(hx + hy > 0 && x + y - hx - hy > 0),
        "BTTS 2H": b(x - hx > 0 && y - hy > 0),
      };
    };

    for (const row of target) {
      const d = new Date(row.date).toISOString().slice(0, 10);
      if (d !== day) {
        day = d;
        const start = Date.parse(d);
        const pr = rows.filter((r) => r.date < start);
        prior = pr.map(toResultRow);
        prefit = fitLeague(prior, undefined);
        const recent = pr.filter((r) => r.htHome !== undefined).slice(-760);
        leagueTotal = recent.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0) / Math.max(1, recent.length);
        clim = {} as Record<M, number[]>;
        for (const m of MARKETS) {
          const kk = m === "Exact total" ? 7 : 2;
          const cnt = new Array(kk).fill(1);
          for (const r of recent) cnt[outcome(r)[m]]++;
          const z = cnt.reduce((a, b2) => a + b2, 0);
          clim[m] = cnt.map((v) => v / z);
        }
      }
      total++;
      const p = buildPrediction(toMatch(row, DIVISIONS[div]), prior, [], { prefit });
      const { home: lam, away: mu } = p.markets.expectedGoals;
      const T = lam + mu;
      const sh = leagueTotal * Math.pow(T / leagueTotal, beta);
      const [ho, , aw] = deVig([row.close!.home, row.close!.draw, row.close!.away]);
      const [pOver] = deVig([row.closeOu!.over, row.closeOu!.under]);
      const mT = totalFromOver(pOver);
      priced++;
      const [ml, mm] = solveMarket(ho, aw, mT);
      // Blend: the market's total and the model's, geometric, weight w on the market.
      const bT = Math.pow(mT, w) * Math.pow(T, 1 - w);

      const variantsGrid: Record<string, { g: Grid; l: number; m: number }> = {
        base: { g: scoreMatrix(lam, mu, p.model.rho), l: lam, m: mu },
        corr: { g: bivariate(lam, mu, c), l: lam, m: mu },
        disp: { g: dispersed(lam, mu, k), l: lam, m: mu },
        shrink: { g: scoreMatrix((lam * sh) / T, (mu * sh) / T, p.model.rho), l: (lam * sh) / T, m: (mu * sh) / T },
        blend: { g: scoreMatrix((lam * bT) / T, (mu * bT) / T, p.model.rho), l: (lam * bT) / T, m: (mu * bT) / T },
        market: { g: scoreMatrix((lam * mT) / T, (mu * mT) / T, p.model.rho), l: (lam * mT) / T, m: (mu * mT) / T },
        ceiling: { g: scoreMatrix(ml, mm), l: ml, m: mm },
      };
      const out = outcome(row);
      for (const v of variants) {
        const { g, l, m } = variantsGrid[v];
        const f = fullProbs(g);
        const hp = halfProbs(l, m);
        const two = (q: number) => [q, 1 - q];
        const probs: Record<M, number[]> = {
          "GG2+": two(f.gg2), "Multi 1-3": two(f.m13), "Multi 2-3": two(f.m23), "Exact total": f.exact, Odd: two(f.odd),
          "Over 2.5": two(f.o25), BTTS: two(f.btts), "Goal both halves": two(hp.bothHalves), "BTTS 2H": two(hp.btts2h),
        };
        for (const mk of MARKETS) sc[v][mk].add(probs[mk], clim[mk], out[mk]);
      }
    }
  }

  console.log(`SHAPE MARKETS, walk-forward ${from}–${to}, ${priced}/${total} priced fixtures; c=${c} k=${k} beta=${beta} w=${w}\n`);
  console.log(`${"market".padEnd(18)}${variants.map((v) => v.padStart(10)).join("")}`);
  for (const m of MARKETS) console.log(`${m.padEnd(18)}${variants.map((v) => `${sc[v][m].skill().toFixed(2)}%`.padStart(10)).join("")}`);
}

void main();
