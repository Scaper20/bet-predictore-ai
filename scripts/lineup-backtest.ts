/**
 * Research only: does knowing who is missing improve the model's goals read?
 * Nothing here changes what the site publishes; app_switches.lineup_adjust
 * stays off unless this says the adjustment clearly helps on games it was not
 * fitted on.
 *
 * Inputs (both in .backtest-cache/, git-ignored):
 *   niche-preds.json       the production model's walk-forward expected goals
 *                          per game (npx tsx scripts/niche-lab.ts --stage=predict)
 *   lineup-features.json   each side's missing regulars per game, point in time
 *                          (scripts/sql/lineup-features.sql, run read-only)
 *
 * Method: join the two by competition, day (±1) and both clubs' names; fit the
 * adjustment (src/lib/model/availability.ts adjustRates: alpha on the missing
 * share of attack, beta per missing regular defender/keeper) on the earlier
 * 60% of games by date; score the later 40% with the exact-score log loss of
 * the Dixon-Coles grid, plus 1X2 and over/under 2.5 log loss. A bootstrap over
 * test games gives a 95% interval for the improvement.
 *
 *   npx tsx scripts/lineup-backtest.ts
 */

import fs from "node:fs";
import path from "node:path";
import { scoreMatrix } from "../src/lib/model/poisson";
import { adjustRates, type SideAvailability } from "../src/lib/model/availability";

const CACHE = path.join(process.cwd(), ".backtest-cache");
const DIV_TO_CODE: Record<string, string> = { E0: "premier-league", SP1: "la-liga", I1: "serie-a", D1: "bundesliga", F1: "ligue-1" };
const DAY = 86_400_000;

interface Pred { d: string; t: number; h: string; a: string; hg: number; ag: number; dc: [number, number, number] }
interface Feat {
  league: string; day: string; home: string; away: string;
  h_att: string; h_def: string; h_gk: boolean; h_miss: number;
  a_att: string; a_def: string; a_gk: boolean; a_miss: number;
}
interface Game { t: number; hg: number; ag: number; lh: number; la: number; rho: number; home: SideAvailability; away: SideAvailability }

function key(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(fc|cf|ac|sc|afc|ssc|as|ss|us|club|de|calcio|1\.)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}
function dice(a: string, b: string): number {
  const ka = key(a), kb = key(b);
  if (ka === kb) return 1;
  if (ka.length < 2 || kb.length < 2) return 0;
  const A = bigrams(ka), B = bigrams(kb);
  let both = 0;
  for (const [g, n] of A) both += Math.min(n, B.get(g) ?? 0);
  return (2 * both) / (ka.length - 1 + kb.length - 1);
}

function side(att: string, def: string, gk: boolean, miss: number): SideAvailability {
  return { gamesLookedAt: 6, regulars: 0, missing: [], attackLoss: Number(att), defenceLoss: Number(def), keeperMissing: gk, basis: "xi", ...{ missingCount: miss } } as SideAvailability;
}

function join(preds: Pred[], feats: Feat[]): { games: Game[]; unmatched: number } {
  const byLeague = new Map<string, Pred[]>();
  for (const p of preds) {
    const code = DIV_TO_CODE[p.d];
    if (code) byLeague.set(code, [...(byLeague.get(code) ?? []), p]);
  }
  const games: Game[] = [];
  let unmatched = 0;
  for (const f of feats) {
    const day = Date.parse(`${f.day}T12:00:00Z`);
    const cands = (byLeague.get(f.league) ?? []).filter((p) => Math.abs(p.t - day) <= 1.5 * DAY);
    const scored = cands
      .map((p) => ({ p, s: Math.min(dice(p.h, f.home), dice(p.a, f.away)) }))
      .sort((x, y) => y.s - x.s);
    const best = scored[0];
    if (!best || best.s < 0.35 || (scored[1] && scored[1].s === best.s)) {
      unmatched++;
      continue;
    }
    const p = best.p;
    games.push({
      t: p.t, hg: p.hg, ag: p.ag, lh: p.dc[0], la: p.dc[1], rho: p.dc[2],
      home: side(f.h_att, f.h_def, f.h_gk, f.h_miss), away: side(f.a_att, f.a_def, f.a_gk, f.a_miss),
    });
  }
  return { games: games.sort((a, b) => a.t - b.t), unmatched };
}

interface Scores { exact: number; x12: number; ou: number }

function score(g: Game, alpha: number, beta: number): Scores {
  const r = alpha === 0 && beta === 0 ? { home: g.lh, away: g.la } : adjustRates({ home: g.lh, away: g.la }, g.home, g.away, alpha, beta);
  const grid = scoreMatrix(r.home, r.away, g.rho);
  let ph = 0, pd = 0, pa = 0, pover = 0, total = 0;
  for (let i = 0; i < grid.length; i++) for (let j = 0; j < grid[i].length; j++) {
    const p = grid[i][j];
    total += p;
    if (i > j) ph += p; else if (i === j) pd += p; else pa += p;
    if (i + j > 2.5) pover += p;
  }
  const eps = 1e-9;
  const exactP = (grid[g.hg]?.[g.ag] ?? 0) / total;
  const res = g.hg > g.ag ? ph : g.hg === g.ag ? pd : pa;
  const over = g.hg + g.ag > 2.5;
  return {
    exact: -Math.log(Math.max(exactP, eps)),
    x12: -Math.log(Math.max(res / total, eps)),
    ou: -Math.log(Math.max((over ? pover : total - pover) / total, eps)),
  };
}

function mean(games: Game[], alpha: number, beta: number): Scores {
  const s = { exact: 0, x12: 0, ou: 0 };
  for (const g of games) {
    const x = score(g, alpha, beta);
    s.exact += x.exact; s.x12 += x.x12; s.ou += x.ou;
  }
  return { exact: s.exact / games.length, x12: s.x12 / games.length, ou: s.ou / games.length };
}

function bootstrap(games: Game[], alpha: number, beta: number, n = 1000): [number, number] {
  const diffs = games.map((g) => score(g, 0, 0).exact - score(g, alpha, beta).exact);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const means: number[] = [];
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rand() * diffs.length)];
    means.push(s / diffs.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(n * 0.025)], means[Math.floor(n * 0.975)]];
}

function main() {
  const preds = JSON.parse(fs.readFileSync(path.join(CACHE, "niche-preds.json"), "utf8")) as Pred[];
  const feats = JSON.parse(fs.readFileSync(path.join(CACHE, "lineup-features.json"), "utf8")) as Feat[];
  const { games, unmatched } = join(preds, feats);
  const cut = Math.floor(games.length * 0.6);
  const train = games.slice(0, cut);
  const test = games.slice(cut);
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);

  // Does a missing attack show up in goals at all? Goals minus the model's
  // expectation, by how much of the side's attack was missing.
  const buckets = [[0, 0.0001], [0.0001, 0.1], [0.1, 0.2], [0.2, 0.35], [0.35, 1.01]] as const;
  const resid = buckets.map(([lo, hi]) => {
    let n = 0, r = 0;
    for (const g of games) {
      for (const [loss, goals, lam] of [[g.home.attackLoss, g.hg, g.lh], [g.away.attackLoss, g.ag, g.la]] as const) {
        if (loss >= lo && loss < hi) { n++; r += goals - lam; }
      }
    }
    return { range: `${Math.round(lo * 100)}-${Math.round(Math.min(hi, 1) * 100)}%`, sides: n, residual: n ? r / n : 0 };
  });

  let best = { alpha: 0, beta: 0, ll: mean(train, 0, 0).exact };
  for (let a = 0; a <= 1.5001; a += 0.05) for (let b = 0; b <= 0.15001; b += 0.01) {
    const ll = mean(train, a, b).exact;
    if (ll < best.ll) best = { alpha: +a.toFixed(2), beta: +b.toFixed(2), ll };
  }
  const base = mean(test, 0, 0);
  const adj = mean(test, best.alpha, best.beta);
  const ci = bootstrap(test, best.alpha, best.beta);

  const out = {
    joined: games.length, unmatched,
    train: { games: train.length, from: day(train[0].t), to: day(train[train.length - 1].t) },
    test: { games: test.length, from: day(test[0].t), to: day(test[test.length - 1].t) },
    fitted: { alpha: best.alpha, beta: best.beta },
    testBaseline: base, testAdjusted: adj,
    exactGainPerGame: base.exact - adj.exact, exactGain95: ci,
    residualByAttackLoss: resid,
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
