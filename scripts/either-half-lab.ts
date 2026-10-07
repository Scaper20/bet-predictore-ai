/**
 * Win either half: why the independent-halves product is underconfident,
 * and the fix, tested walk-forward.
 *
 * Step 1 (slow, cached): every fixture 2019-27 predicted from matches before
 * its matchday only, as goal-markets-lab.ts does; the expected goals and the
 * real half-time and full-time scores are written to
 * .backtest-cache/either-half.json.
 * Step 2: candidate versions of the market, tuned on 2019-22 and scored
 * once on 2022-27 against climatology.
 *
 *   npx tsx scripts/either-half-lab.ts            # uses the cache
 *   npx tsx scripts/either-half-lab.ts --refresh  # rebuilds it
 */

import fs from "node:fs";
import path from "node:path";
import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { halfGrids, halfMarkets, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT } from "../src/lib/model/halves";
import { goalMarkets } from "../src/lib/model/goal-markets";
import { CACHE, csv, DIVISIONS, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const SEASONS = ["1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"];
const FIRST = "1920";
const HOLDOUT = "2223";
const FILE = path.join(CACHE, "either-half.json");
const SHARE = { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE };

export interface Rec {
  div: string;
  date: number;
  holdout: boolean;
  lam: number;
  mu: number;
  rho: number;
  hx: number;
  hy: number;
  x: number;
  y: number;
}

async function build(): Promise<Rec[]> {
  const out: Rec[] = [];
  for (const div of Object.keys(DIVISIONS)) {
    const rows: Row[] = [];
    for (const s of SEASONS) {
      try {
        rows.push(...parse(await csv(s, div), div));
      } catch {
        // not published
      }
    }
    rows.sort((a, b) => a.date - b.date);
    const startOf = async (season: string) => parse(await csv(season, div), div)[0]?.date ?? Infinity;
    const lo = await startOf(FIRST);
    const hold = await startOf(HOLDOUT);
    const target = rows.filter((r) => r.date >= lo && r.htHome !== undefined && r.htAway !== undefined);
    let dayKey = "";
    let prior: ReturnType<typeof toResultRow>[] = [];
    let prefit: ReturnType<typeof fitLeague> | undefined;
    for (const row of target) {
      const day = new Date(row.date).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        const start = Date.parse(day);
        prior = rows.filter((r) => r.date < start).map(toResultRow);
        prefit = fitLeague(prior, undefined);
      }
      const p = buildPrediction(toMatch(row, DIVISIONS[div]), prior, [], { prefit });
      out.push({
        div, date: row.date, holdout: row.date >= hold,
        lam: p.markets.expectedGoals.home, mu: p.markets.expectedGoals.away, rho: p.model.rho,
        hx: row.htHome!, hy: row.htAway!, x: row.homeGoals, y: row.awayGoals,
      });
    }
    console.error(`${div}: ${out.length}`);
  }
  return out;
}

async function load(): Promise<Rec[]> {
  if (!process.argv.includes("--refresh") && fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, "utf8"));
  const recs = await build();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(recs));
  return recs;
}

/** Half probabilities the site uses today, per fixture. */
function halves(r: Rec) {
  const g = goalMarkets([[1]], halfGrids(r.lam, r.mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT));
  return g;
}

const ll = (p: number, hit: boolean) => -Math.log(Math.max(1e-9, hit ? p : 1 - p));

function reliability(label: string, ps: number[], hits: boolean[]) {
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
  for (let i = 0; i < ps.length; i++) {
    const b = Math.min(9, Math.floor(ps[i] * 10));
    bins[b][0] += ps[i];
    bins[b][1] += hits[i] ? 1 : 0;
    bins[b][2]++;
  }
  let ece = 0;
  const cells: string[] = [];
  for (const [sp, h, c] of bins) {
    if (!c) continue;
    ece += (c / ps.length) * Math.abs(sp / c - h / c);
    if (c >= 50) cells.push(`${((sp / c) * 100).toFixed(0)}→${((h / c) * 100).toFixed(0)} (${c})`);
  }
  const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  const rate = hits.filter(Boolean).length / hits.length;
  console.log(`${label.padEnd(26)} mean ${(mean * 100).toFixed(1)} landed ${(rate * 100).toFixed(1)}  ECE ${(ece * 100).toFixed(2)}pt  ${cells.join("  ")}`);
}

async function main() {
  const recs = await load();
  const hold = recs.filter((r) => r.holdout);
  console.log(`${recs.length} fixtures, ${hold.length} held out\n`);

  console.log("DIAGNOSIS, held out: each piece of win either half (home)");
  const parts: Record<string, [number[], boolean[]]> = {};
  const push = (k: string, p: number, h: boolean) => {
    (parts[k] ??= [[], []])[0].push(p);
    parts[k][1].push(h);
  };
  for (const r of hold) {
    const g = halves(r);
    const sx = r.x - r.hx, sy = r.y - r.hy;
    const w1 = r.hx > r.hy, w2 = sx > sy, a1 = r.hy > r.hx, a2 = sy > sx;
    const f = g.firstHalfHandicap["-0.5"].home;
    push("Home wins 1st half", f, w1);
    push("Home wins 2nd half", g.secondHalf.home, w2);
    push("Home wins both", g.winBothHalves.home, w1 && w2);
    push("Home wins either", g.winEitherHalf.home, w1 || w2);
    push("Away wins 1st half", g.firstHalfHandicap["+0.5"].away, a1);
    push("Away wins 2nd half", g.secondHalf.away, a2);
    push("Away wins either", g.winEitherHalf.away, a1 || a2);
  }
  for (const [k, [p, h]] of Object.entries(parts)) reliability(k, p, h);

  // Candidate A: the second half gets its own tilt toward the stronger side
  // (today it is whatever the first half leaves, which tilts it away).
  const tune = recs.filter((r) => !r.holdout);
  const markets = (r: Rec, t2: number) => {
    return goalMarkets([[1]], halfGrids(r.lam, r.mu, SHARE, SITE_HALF_TILT, t2));
  };
  const outcomes = (r: Rec) => {
    const sx = r.x - r.hx, sy = r.y - r.hy;
    return {
      h1: r.hx > r.hy, a1: r.hy > r.hx, h2: sx > sy, a2: sy > sx, d2: sx === sy,
    };
  };
  const loss = (set: Rec[], t2: number) => {
    let either = 0, second = 0, both = 0;
    for (const r of set) {
      const g = markets(r, t2);
      const o = outcomes(r);
      either += ll(g.winEitherHalf.home, o.h1 || o.h2) + ll(g.winEitherHalf.away, o.a1 || o.a2);
      second += -Math.log(o.h2 ? g.secondHalf.home : o.a2 ? g.secondHalf.away : g.secondHalf.draw);
      both += ll(g.winBothHalves.home, o.h1 && o.h2) + ll(g.winBothHalves.away, o.a1 && o.a2);
    }
    return { either: either / set.length, second: second / set.length, both: both / set.length };
  };
  console.log("\nCANDIDATE A, tuning 2019-22: second-half tilt toward the stronger side (log loss per fixture)");
  let bestT = 0, bestL = Infinity;
  for (const t2 of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) {
    const l = loss(tune, t2);
    const total = l.either + l.second + l.both;
    if (total < bestL) [bestT, bestL] = [t2, total];
    console.log(`  tilt ${t2.toFixed(2)}  either ${l.either.toFixed(5)}  2H result ${l.second.toFixed(5)}  both ${l.both.toFixed(5)}`);
  }
  console.log(`  best ${bestT}`);

  // Candidate B: today's numbers through a logistic recalibration curve,
  // logit(p') = a + b logit(p), fitted on 2019-22 (home and away pooled).
  const logit = (p: number) => Math.log(p / (1 - p));
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  const pairs = (set: Rec[], t2: number) =>
    set.flatMap((r) => {
      const g = markets(r, t2);
      const o = outcomes(r);
      return [[g.winEitherHalf.home, o.h1 || o.h2], [g.winEitherHalf.away, o.a1 || o.a2]] as [number, boolean][];
    });
  const fitPlatt = (data: [number, boolean][]) => {
    let a = 0, b = 1;
    for (let it = 0; it < 50; it++) {
      // Newton step on the two parameters.
      let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
      for (const [p, y] of data) {
        const z = logit(p), q = sig(a + b * z), e = q - (y ? 1 : 0), w = q * (1 - q);
        ga += e; gb += e * z; haa += w; hab += w * z; hbb += w * z * z;
      }
      const det = haa * hbb - hab * hab;
      a -= (hbb * ga - hab * gb) / det;
      b -= (haa * gb - hab * ga) / det;
    }
    return { a, b };
  };
  const platt = fitPlatt(pairs(tune, 0));
  console.log(`\nCANDIDATE B: recalibration curve a=${platt.a.toFixed(4)} b=${platt.b.toFixed(4)}`);

  console.log("\nHELD OUT 2022-27");
  const clim = (set: Rec[]) => {
    // League base rate from the tuning seasons, per side.
    const by = (k: "h" | "a") => set.filter((r) => { const o = outcomes(r); return k === "h" ? o.h1 || o.h2 : o.a1 || o.a2; }).length / set.length;
    return { h: by("h"), a: by("a") };
  };
  const base = clim(tune);
  const report = (label: string, f: (r: Rec) => { h: number; a: number }) => {
    const ph: number[] = [], hh: boolean[] = [], pa: number[] = [], ha: boolean[] = [];
    let lm = 0, lc = 0;
    for (const r of hold) {
      const o = outcomes(r);
      const p = f(r);
      ph.push(p.h); hh.push(o.h1 || o.h2); pa.push(p.a); ha.push(o.a1 || o.a2);
      lm += ll(p.h, o.h1 || o.h2) + ll(p.a, o.a1 || o.a2);
      lc += ll(base.h, o.h1 || o.h2) + ll(base.a, o.a1 || o.a2);
    }
    console.log(`${label}: skill ${((1 - lm / lc) * 100).toFixed(2)}%`);
    reliability("  home either", ph, hh);
    reliability("  away either", pa, ha);
  };
  report("Today", (r) => { const g = markets(r, 0); return { h: g.winEitherHalf.home, a: g.winEitherHalf.away }; });
  report(`A: 2H tilt ${bestT}`, (r) => { const g = markets(r, bestT); return { h: g.winEitherHalf.home, a: g.winEitherHalf.away }; });
  report("B: recalibrated", (r) => { const g = markets(r, 0); return { h: sig(platt.a + platt.b * logit(g.winEitherHalf.home)), a: sig(platt.a + platt.b * logit(g.winEitherHalf.away)) }; });
  const plattA = fitPlatt(pairs(tune, bestT));
  report(`A+B (a=${plattA.a.toFixed(3)} b=${plattA.b.toFixed(3)})`, (r) => { const g = markets(r, bestT); return { h: sig(plattA.a + plattA.b * logit(g.winEitherHalf.home)), a: sig(plattA.a + plattA.b * logit(g.winEitherHalf.away)) }; });

  console.log("\nHELD OUT, the other second-half markets under A");
  for (const t of [0, bestT]) {
    const p2: number[] = [], h2: boolean[] = [], pb: number[] = [], hb: boolean[] = [];
    for (const r of hold) {
      const g = markets(r, t);
      const o = outcomes(r);
      p2.push(g.secondHalf.home); h2.push(o.h2); pb.push(g.winBothHalves.home); hb.push(o.h1 && o.h2);
    }
    reliability(`  tilt ${t} home 2H win`, p2, h2);
    reliability(`  tilt ${t} home both`, pb, hb);
  }

  console.log("\nHELD OUT, the published Pro half markets (log loss per fixture; lower is better)");
  const R = (a: number, b: number) => (a > b ? "H" : a === b ? "D" : "A");
  for (const t of [0, bestT]) {
    let htft = 0, sh05 = 0, sh15 = 0, highest = 0, ht = 0;
    for (const r of hold) {
      const m = halfMarkets(r.lam, r.mu, SHARE, SITE_HALF_TILT, t);
      const s2 = r.x + r.y - r.hx - r.hy, s1 = r.hx + r.hy;
      htft += -Math.log(Math.max(1e-9, m.htft[`${R(r.hx, r.hy)}/${R(r.x, r.y)}`]));
      sh05 += ll(m.shOver["0.5"], s2 > 0.5);
      sh15 += ll(m.shOver["1.5"], s2 > 1.5);
      highest += -Math.log(s1 > s2 ? m.highestHalf.first : s1 < s2 ? m.highestHalf.second : m.highestHalf.equal);
      ht += -Math.log(r.hx > r.hy ? m.ht.home : r.hx < r.hy ? m.ht.away : m.ht.draw);
    }
    const n = hold.length;
    console.log(`  tilt ${t}: HT/FT ${(htft / n).toFixed(5)}  2H over 0.5 ${(sh05 / n).toFixed(5)}  2H over 1.5 ${(sh15 / n).toFixed(5)}  highest half ${(highest / n).toFixed(5)}  HT result ${(ht / n).toFixed(5)}`);
  }
}

void main();
