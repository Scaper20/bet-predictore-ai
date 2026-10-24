/**
 * Research only: are the corners chances honest, game by game and team by
 * team? Prompted by Arsenal: "Under 12.5 corners" on the games of a side
 * that wins (and concedes) a lot of corners looked wrong, and both published
 * picks lost.
 *
 * Reads the walk-forward predictions scripts/niche-lab.ts writes (run
 * `npx tsx scripts/niche-lab.ts --stage=predict` first): for every game, the
 * production count model's expected corners per side, its spread, and what
 * happened. Each chance is computed exactly as the site does
 * (match-stats.ts statGrid).
 *
 *   npx tsx scripts/corner-realism.ts
 */
import fs from "node:fs";
import path from "node:path";
import { statGrid } from "../src/lib/model/match-stats";
import { CACHE } from "./lib/football-data-uk";

/** Where scripts/niche-lab.ts writes its predictions (importing it would run it). */
const PREDS_FILE = path.join(CACHE, "niche-preds.json");

interface Pred {
  d: string;
  t: number;
  h: string;
  a: string;
  st: { corners?: [number, number, number, number, number, number, number, number] };
}

interface Game {
  home: string;
  away: string;
  expH: number;
  expA: number;
  total: number[]; // P(total = n)
  homeDist: number[];
  awayDist: number[];
  ah: number;
  aa: number;
}

const preds = JSON.parse(fs.readFileSync(PREDS_FILE, "utf8")) as Pred[];
const games: Game[] = [];
for (const p of preds) {
  const c = p.st.corners;
  if (!c || c[6] < 0) continue;
  const grid = statGrid({ home: c[0], away: c[1] }, { kTotal: c[2], rho: c[3] }, 30);
  const total = new Array<number>(61).fill(0);
  const homeDist = new Array<number>(31).fill(0);
  const awayDist = new Array<number>(31).fill(0);
  grid.forEach((row, i) => row.forEach((q, j) => {
    total[i + j] += q;
    homeDist[i] += q;
    awayDist[j] += q;
  }));
  games.push({ home: p.h, away: p.a, expH: c[0], expA: c[1], total, homeDist, awayDist, ah: c[6], aa: c[7] });
}
const cdf = (dist: number[], upTo: number) => dist.slice(0, Math.floor(upTo) + 1).reduce((s, x) => s + x, 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log(`${games.length} games with corners, walk-forward from July 2024\n`);

console.log("Total corners: said v landed for 'under L', and the worst 5-point bucket (n >= 150)");
for (const line of [7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5]) {
  let said = 0, hit = 0;
  const buckets = new Map<number, { n: number; p: number; hit: number }>();
  for (const g of games) {
    const p = cdf(g.total, line);
    const h = g.ah + g.aa < line ? 1 : 0;
    said += p;
    hit += h;
    const b = Math.floor(p * 20);
    const x = buckets.get(b) ?? { n: 0, p: 0, hit: 0 };
    x.n++; x.p += p; x.hit += h;
    buckets.set(b, x);
  }
  let worst = "";
  let gap = 0;
  for (const [, x] of buckets) {
    if (x.n < 150) continue;
    const d = x.hit / x.n - x.p / x.n;
    if (Math.abs(d) > Math.abs(gap)) {
      gap = d;
      worst = `said ${pct(x.p / x.n)}, landed ${pct(x.hit / x.n)} (n ${x.n})`;
    }
  }
  console.log(`  under ${line.toFixed(1).padStart(4)}: said ${pct(said / games.length)}, landed ${pct(hit / games.length)}   worst: ${worst}`);
}

// The published rule: corners under 12.5 at 82-85%.
{
  const inRule = games.filter((g) => {
    const p = cdf(g.total, 12.5);
    return p >= 0.82 && p <= 0.85;
  });
  const said = inRule.reduce((s, g) => s + cdf(g.total, 12.5), 0) / inRule.length;
  const hit = inRule.filter((g) => g.ah + g.aa < 12.5).length / inRule.length;
  console.log(`\nThe published rule, under 12.5 at 82-85%: n ${inRule.length}, said ${pct(said)}, landed ${pct(hit)}`);
  for (const [lo, hi] of [[0, 9.5], [9.5, 10.5], [10.5, 11.5], [11.5, 99]]) {
    const xs = inRule.filter((g) => g.expH + g.expA >= lo && g.expH + g.expA < hi);
    if (xs.length < 30) continue;
    console.log(`  expected total ${lo}-${hi === 99 ? "+" : hi}: n ${xs.length}, landed ${pct(xs.filter((g) => g.ah + g.aa < 12.5).length / xs.length)}`);
  }
}

console.log("\nTeam corners: said v landed for 'home over k' and 'away over k'");
for (const k of [2.5, 3.5, 4.5, 5.5, 6.5]) {
  let sh = 0, hh = 0, sa = 0, ha = 0;
  for (const g of games) {
    sh += 1 - cdf(g.homeDist, k);
    hh += g.ah > k ? 1 : 0;
    sa += 1 - cdf(g.awayDist, k);
    ha += g.aa > k ? 1 : 0;
  }
  console.log(`  over ${k}: home said ${pct(sh / games.length)} landed ${pct(hh / games.length)}; away said ${pct(sa / games.length)} landed ${pct(ha / games.length)}`);
}

console.log("\nTeams the model reads worst (games' total corners: landed minus expected, 95% interval), 40+ games");
const byTeam = new Map<string, { n: number; sum: number; sq: number; own: number; under: number; underHit: number }>();
for (const g of games) {
  const r = g.ah + g.aa - (g.expH + g.expA);
  for (const [team, own] of [[g.home, g.ah - g.expH], [g.away, g.aa - g.expA]] as const) {
    const x = byTeam.get(team) ?? { n: 0, sum: 0, sq: 0, own: 0, under: 0, underHit: 0 };
    x.n++; x.sum += r; x.sq += r * r; x.own += own;
    x.under += cdf(g.total, 12.5);
    x.underHit += g.ah + g.aa < 12.5 ? 1 : 0;
    byTeam.set(team, x);
  }
}
const rows = [...byTeam.entries()]
  .filter(([, x]) => x.n >= 40)
  .map(([team, x]) => {
    const mean = x.sum / x.n;
    const sd = Math.sqrt(Math.max(0, x.sq / x.n - mean * mean));
    return { team, n: x.n, mean, half: (1.96 * sd) / Math.sqrt(x.n), own: x.own / x.n, under: x.under / x.n, underHit: x.underHit / x.n };
  });
const flagged = rows.filter((r) => Math.abs(r.mean) - r.half > 0).sort((a, b) => b.mean - a.mean);
console.log(`  ${flagged.length} of ${rows.length} teams outside their interval:`);
for (const r of flagged) {
  console.log(`  ${r.team.padEnd(22)} n ${String(r.n).padStart(3)}  total ${r.mean >= 0 ? "+" : ""}${r.mean.toFixed(2)} ±${r.half.toFixed(2)}  own ${r.own >= 0 ? "+" : ""}${r.own.toFixed(2)}  under 12.5 said ${pct(r.under)} landed ${pct(r.underHit)}`);
}
for (const name of ["Arsenal", "Liverpool", "Man City", "Bayern Munich", "Leverkusen", "Chelsea", "Tottenham"]) {
  const r = rows.find((x) => x.team === name);
  if (r) console.log(`  ${name.padEnd(22)} n ${String(r.n).padStart(3)}  total ${r.mean >= 0 ? "+" : ""}${r.mean.toFixed(2)} ±${r.half.toFixed(2)}  own ${r.own >= 0 ? "+" : ""}${r.own.toFixed(2)}  under 12.5 said ${pct(r.under)} landed ${pct(r.underHit)}`);
}
