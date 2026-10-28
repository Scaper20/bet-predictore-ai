/**
 * Research only: the headline engine (src/lib/model/headline-engine.ts)
 * against the headline the site publishes today.
 *
 * Reads the walk-forward cache written by scripts/niche-lab.ts
 * --stage=predict (17 divisions, July 2024 on). Every game's candidates are
 * priced from the stored goals model (Dixon-Coles) and count model
 * (corners, shots, shots on target). SportyBet's chance on the result,
 * double chance and 2.5 goals line is the closing market's, de-vigged; on
 * other lines the model's. Its stat ladder is stood in for as in
 * scripts/listed-lines-lab.ts: the k lines nearest 50/50 per family, on 45%
 * of games for corners and 22% for shots (its board, October 2026).
 *
 * Tune season (to June 2025): each family's calibration map is fitted.
 * Holdout (July 2025 on): the engine with that map picks one headline per
 * game; reported against today's headline on the same games: landed,
 * stated, the price it loads at, the family mix and month by month.
 *
 *   npx tsx scripts/headline-lab.ts            report
 *   npx tsx scripts/headline-lab.ts --emit     also print the map to paste
 */

import fs from "node:fs";
import path from "node:path";
import { statGrid, STAT_LINES } from "../src/lib/model/match-stats";
import { scoreMatrix } from "../src/lib/model/poisson";
import {
  calibrationKey,
  engineFamily,
  marginFor,
  rankCandidates,
  type Calibration,
  type EngineChoice,
} from "../src/lib/model/headline-engine";
import type { Pred } from "./niche-lab";
import { chance, closing, dists, GOALS, KINDS, ladder, LISTED_SHARE, won, type Cand, type Kind } from "./lib/replay-lines";
import { CACHE } from "./lib/football-data-uk";

const PREDS_FILE = path.join(CACHE, "niche-preds.json");
const SPLIT = Date.UTC(2025, 6, 1);
const EMIT = process.argv.includes("--emit");
const BY_MARKET = process.argv.includes("--by-market");

/** A stable 0-1 draw per game and family, so a family is "listed" on the same games every run. */
function listed(r: Pred, kind: Kind): boolean {
  let x = 2166136261;
  for (const ch of `${r.d}|${r.t}|${r.h}|${kind}`) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return ((x >>> 0) % 1000) / 1000 < LISTED_SHARE[kind];
}

/** Every candidate on a game, graded. Goals lines are always on the board; stat lines only where listed. */
function candidates(r: Pred): Cand[] {
  const goals = dists(scoreMatrix(r.dc[0], r.dc[1], r.dc[2]));
  const out: Cand[] = [];
  const push = (market: string, p: number, h: number, a: number) => {
    const q = closing(market, r.mk);
    // The price SportyBet would pay: its own chance where known, else ours, with its margin.
    const price = 1 / ((q ?? p) * marginFor(market));
    out.push({ market, probability: p, marketChance: q, price, won: won(market, h, a) });
  };
  for (const m of GOALS) push(m, chance(m, goals), r.hg, r.ag);
  for (const k of KINDS) {
    const v = r.st[k];
    if (!v || v[6] < 0 || !listed(r, k)) continue;
    const d = dists(statGrid({ home: v[0], away: v[1] }, { kTotal: v[2], rho: v[3] }, STAT_LINES[k].max));
    for (const m of ladder(k, d)) push(m, chance(m, d), v[6], v[7]);
  }
  return out;
}

/* ---------------------------------------------------------- calibration */

/** Equal-count bins, shrunk toward the stated chance, then pooled until landed rises with claimed (PAV). */
function fitFamily(xs: { p: number; won: boolean }[]): [number, number][] {
  const pts = xs.filter((x) => x.p >= 0.5 && x.p <= 0.95).sort((a, b) => a.p - b.p);
  if (pts.length < 400) return [];
  const bins = Math.min(12, Math.floor(pts.length / 300));
  const PRIOR = 1000;
  let blocks: { p: number; w: number; n: number }[] = [];
  for (let b = 0; b < bins; b++) {
    const slice = pts.slice(Math.floor((b * pts.length) / bins), Math.floor(((b + 1) * pts.length) / bins));
    const p = slice.reduce((s, x) => s + x.p, 0) / slice.length;
    const w = slice.filter((x) => x.won).length;
    blocks.push({ p, w: w + PRIOR * p, n: slice.length + PRIOR });
  }
  // Pool adjacent violators.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].w / blocks[i].n < blocks[i - 1].w / blocks[i - 1].n) {
        const a = blocks[i - 1], b = blocks[i];
        const merged = { p: (a.p * a.n + b.p * b.n) / (a.n + b.n), w: a.w + b.w, n: a.n + b.n };
        blocks = [...blocks.slice(0, i - 1), merged, ...blocks.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return blocks.map((b) => [Math.round(b.p * 1000) / 1000, Math.round((b.w / b.n) * 1000) / 1000]);
}

/* -------------------------------------------------------------- report */

interface Tally { n: number; won: number; stated: number; price: number }
const tally = (): Tally => ({ n: 0, won: 0, stated: 0, price: 0 });
const add = (t: Tally, p: number, w: boolean, price: number) => { t.n++; t.stated += p; t.price += price; if (w) t.won++; };
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const show = (t: Tally, of?: number) =>
  t.n ? `${String(t.n).padStart(5)} picks${of ? ` (${String(Math.round((100 * t.n) / of)).padStart(3)}%)` : ""}  landed ${pct(t.won / t.n).padStart(6)}  stated ${pct(t.stated / t.n).padStart(6)}  avg price ${(t.price / t.n).toFixed(2)}` : "    — none";

function main() {
  const preds: Pred[] = JSON.parse(fs.readFileSync(PREDS_FILE, "utf8"));
  const tune = preds.filter((r) => r.t < SPLIT);
  const hold = preds.filter((r) => r.t >= SPLIT);
  console.log(`${preds.length} games: tune ${tune.length} (to June 2025), holdout ${hold.length}\n`);

  // Fit: every candidate in the tune season, by family.
  const byFam = new Map<string, { p: number; won: boolean }[]>();
  for (const r of tune) for (const c of candidates(r)) {
    if (!engineFamily(c.market)) continue;
    const f = calibrationKey(c.market);
    if (!byFam.has(f)) byFam.set(f, []);
    byFam.get(f)!.push({ p: c.probability, won: c.won });
  }
  const table: Record<string, [number, number][]> = {};
  console.log("Calibration on the tune season, 70-85% claimed band (all candidates):");
  for (const [f, xs] of [...byFam].sort()) {
    const knots = fitFamily(xs);
    if (knots.length) table[f] = knots;
    const band = xs.filter((x) => x.p >= 0.7 && x.p <= 0.85);
    const landed = band.filter((x) => x.won).length / (band.length || 1);
    const stated = band.reduce((s, x) => s + x.p, 0) / (band.length || 1);
    console.log(`  ${f.padEnd(22)} ${String(band.length).padStart(6)}  stated ${pct(stated)}  landed ${pct(landed)}  ${landed - stated >= 0 ? "+" : ""}${(100 * (landed - stated)).toFixed(1)}`);
  }

  if (BY_MARKET) {
    // Each line in the band the engine picks from (74-80%), tune against holdout.
    const band = (rs: Pred[]) => {
      const m = new Map<string, Tally>();
      for (const r of rs) for (const c of candidates(r)) {
        if (c.probability < 0.74 || c.probability > 0.8 || (c.price ?? 0) < 1.2) continue;
        const key = c.market.replace(/:[+-]?\d+(\.\d+)?$/, (x) => (/^(corners|shots|sot)/.test(c.market) ? ":n" : x));
        const t = m.get(key) ?? tally();
        add(t, c.probability, c.won, c.price ?? 0);
        m.set(key, t);
      }
      return m;
    };
    const a = band(tune), b = band(hold);
    console.log("\nBy line, 74-80% band, paying 1.20+: tune | holdout");
    for (const [k, t] of [...a].sort((x, y) => y[1].n - x[1].n)) {
      const h = b.get(k) ?? tally();
      console.log(`  ${k.padEnd(24)} ${String(t.n).padStart(5)} ${pct(t.won / t.n).padStart(6)} (${pct(t.stated / t.n)})  | ${String(h.n).padStart(5)} ${pct(h.won / (h.n || 1)).padStart(6)} (${pct(h.stated / (h.n || 1))})`);
    }
  }

  // Holdout: today's headline against the engine, raw and calibrated.
  const pub = tally(), pubFloor = tally();
  const variants: { name: string; cal: Calibration; goalsOnly?: boolean }[] = [
    { name: "engine, raw chances", cal: {} },
    { name: "engine, calibrated, goals families only", cal: table, goalsOnly: true },
    { name: "engine, calibrated (proposed)", cal: table },
  ];
  const res = variants.map(() => ({ all: tally(), mix: new Map<string, Tally>(), month: new Map<string, { e: Tally; p: Tally }>(), strong: new Map<number, Tally>(), same: 0 }));
  const strongAt = [0.74, 0.76, 0.78, 0.8, 0.82];
  for (const r of hold) {
    const cands = candidates(r);
    const byMarket = new Map(cands.map((c) => [c.market, c]));
    const month = new Date(r.t).toISOString().slice(0, 7);
    let pubPick: Cand | undefined;
    if (r.pub) {
      const price = 1 / ((closing(r.pub[0], r.mk) ?? r.pub[1]) * marginFor(r.pub[0]));
      const w = won(r.pub[0], r.hg, r.ag);
      add(pub, r.pub[1], w, price);
      if (price >= 1.2) add(pubFloor, r.pub[1], w, price);
      pubPick = byMarket.get(r.pub[0]);
    }
    variants.forEach((v, i) => {
      const pool = v.goalsOnly ? cands.filter((c) => !/^(corners|shots|sot):/.test(c.market)) : cands;
      const pick = rankCandidates(pool, { onBoard: true, calibration: v.cal })[0] as (EngineChoice & { won: boolean }) | undefined;
      if (!pick) return;
      const o = res[i];
      add(o.all, pick.calibrated, pick.won, pick.loadPrice);
      const t = o.mix.get(pick.family) ?? tally();
      add(t, pick.calibrated, pick.won, pick.loadPrice);
      o.mix.set(pick.family, t);
      const mo = o.month.get(month) ?? { e: tally(), p: tally() };
      add(mo.e, pick.calibrated, pick.won, pick.loadPrice);
      if (r.pub) add(mo.p, r.pub[1], won(r.pub[0], r.hg, r.ag), 0);
      o.month.set(month, mo);
      for (const s of strongAt) if (pick.score >= s) { const st = o.strong.get(s) ?? tally(); add(st, pick.calibrated, pick.won, pick.loadPrice); o.strong.set(s, st); }
      if (pubPick && pubPick.market === pick.market) o.same++;
    });
  }

  console.log(`\nHoldout, ${hold.length} games`);
  console.log(`  today's headline             ${show(pub, hold.length)}`);
  console.log(`  ...where it pays 1.20+       ${show(pubFloor, hold.length)}`);
  variants.forEach((v, i) => {
    const o = res[i];
    console.log(`\n  ${v.name}\n    ${show(o.all, hold.length)}   same pick as today: ${Math.round((100 * o.same) / (o.all.n || 1))}%`);
    for (const [f, t] of [...o.mix].sort((a, b) => b[1].n - a[1].n)) console.log(`      ${f.padEnd(17)} ${show(t)}`);
    console.log("    Strong at:");
    for (const s of strongAt) console.log(`      ${s.toFixed(2)}  ${show(o.strong.get(s) ?? tally(), hold.length)}`);
    console.log("    month by month (engine / today):");
    for (const [m, x] of [...o.month].sort()) console.log(`      ${m}  ${pct(x.e.won / (x.e.n || 1)).padStart(6)} of ${String(x.e.n).padStart(4)}   ${pct(x.p.won / (x.p.n || 1)).padStart(6)} of ${String(x.p.n).padStart(4)}`);
  });

  if (EMIT) console.log(`\nexport const ENGINE_CALIBRATION: Calibration = {\n${Object.entries(table).map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`).join("\n")}\n};`);
}

main();
