/**
 * Liga MX replay (football-data.co.uk new-leagues file MEX.csv): is the model
 * weak there, and does a league-specific change help? Walk-forward, same rules
 * as audit-eval.ts (fit on results before the matchday, 1,200-row cap), ranker
 * picks only because liga-mx is outside the sweet-spot leagues. Stops at 31 Oct
 * 2026 (frozen holdout, scripts/lib/holdout.ts).
 *
 *   npx tsx scripts/audit-ligamx.ts --file=<MEX.csv>
 */
import fs from "node:fs";
import { buildPrediction, type ModelOptions } from "../src/lib/model/predict";
import { fitLeague, type FitOptions } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import { deVig } from "../src/lib/model/backtest";
import { toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { TUNING_END } from "./lib/holdout";

const DAY = 86_400_000;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const T = (s: string) => Date.parse(s);
const WINS: [string, number, number][] = [
  ["2022-25 (derive)", T("2022-07-01"), T("2025-07-01")],
  ["2025-26 held-out", T("2025-07-01"), T("2026-07-01")],
  ["Sep-Oct 2026", T("2026-09-01"), T("2026-11-01")],
];
const END = T(TUNING_END) + DAY;

function load(file: string): Row[] {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines[0].replace(/^﻿/, "").split(",");
  const at = (n: string) => head.indexOf(n);
  const rows: Row[] = [];
  for (const l of lines.slice(1)) {
    const f = l.split(",");
    if (f[at("League")] !== "Liga MX") continue;
    const [d, m, y] = f[at("Date")].split("/").map(Number);
    const [hh, mm] = (f[at("Time")] || "20:00").split(":").map(Number);
    const hg = Number(f[at("HG")]), ag = Number(f[at("AG")]);
    if (!d || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const ch = Number(f[at("AvgCH")]), cd = Number(f[at("AvgCD")]), ca = Number(f[at("AvgCA")]);
    rows.push({
      div: "MEX", date: Date.UTC(y, m - 1, d, hh || 20, mm || 0), home: f[at("Home")], away: f[at("Away")], homeGoals: hg, awayGoals: ag,
      close: ch > 1 && cd > 1 && ca > 1 ? { home: ch, draw: cd, away: ca } : undefined,
    });
  }
  return rows.sort((a, b) => a.date - b.date);
}

type Cfg = ModelOptions & { fitOpts?: FitOptions };
const CONFIGS: Record<string, Cfg> = {
  shipped: {},
  "draw x1.05": { drawInflation: 1.05 },
  "draw x1.10": { drawInflation: 1.1 },
  "draw x1.15": { drawInflation: 1.15 },
  "stretch 0.9": { strengthStretch: 0.9 },
  "reg 0.03": { fitOpts: { regularisation: 0.03 } },
  "half-life 120": { fitOpts: { halfLifeDays: 120 } },
  "half-life 365": { fitOpts: { halfLifeDays: 365 } },
  "no dc:home-away": { excludeHeadline: ["ou:under:1.5", "ou:under:2.5", "ou:under:3.5", "dc:home-away"] },
};

interface Out { date: number; probs: [number, number, number]; res: number; mkt?: [number, number, number]; pick?: { market: string; p: number; o: string | null }; over25: number; total: number }

function run(rows: Row[], cfg: Cfg): Out[] {
  const { fitOpts, ...options } = cfg;
  const out: Out[] = [];
  const league = { code: "liga-mx", label: "Liga MX" };
  const fits = new Map<number, ReturnType<typeof fitLeague>>();
  let i = 0;
  for (const row of rows.filter((r) => r.date >= WINS[0][1] && r.date < END)) {
    const day = Math.floor(row.date / DAY) * DAY;
    while (i < rows.length && rows[i].date < day) i++;
    const prior = rows.slice(Math.max(0, i - 1200), i).map(toResultRow);
    let fit = fits.get(day);
    if (!fit) fits.set(day, (fit = fitLeague(prior, fitOpts)));
    const p = buildPrediction(toMatch(row, league), prior, [], { ...options, prefit: fit });
    if (!p.sufficiency.publishable) continue;
    const m = p.markets;
    out.push({
      date: row.date,
      probs: [m.home, m.draw, m.away],
      res: row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2,
      mkt: row.close ? (deVig([row.close.home, row.close.draw, row.close.away]) as [number, number, number]) : undefined,
      pick: p.topPick ? { market: p.topPick.market, p: p.topPick.probability, o: evaluatePick(p.topPick.market, row.homeGoals, row.awayGoals) } : undefined,
      over25: m.over["2.5"], total: row.homeGoals + row.awayGoals,
    });
  }
  return out;
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
function summary(os: Out[]) {
  const n = os.length;
  const ll = os.reduce((a, o) => a - Math.log(o.probs[o.res]), 0) / n;
  const mk = os.filter((o) => o.mkt);
  const mll = mk.reduce((a, o) => a - Math.log(o.mkt![o.res]), 0) / Math.max(1, mk.length);
  const draw = os.filter((o) => o.res === 1).length / n, mdraw = os.reduce((a, o) => a + o.probs[1], 0) / n;
  const home = os.filter((o) => o.res === 0).length / n, mhome = os.reduce((a, o) => a + o.probs[0], 0) / n;
  const picks = os.filter((o) => o.pick && (o.pick.o === "win" || o.pick.o === "lose"));
  const hit = picks.filter((o) => o.pick!.o === "win").length / Math.max(1, picks.length);
  const st = picks.reduce((a, o) => a + o.pick!.p, 0) / Math.max(1, picks.length);
  return { n, ll, mll, draw, mdraw, home, mhome, picks: picks.length, hit, st };
}

function main() {
  const rows = load(arg("file") ?? "MEX.csv");
  console.log(`Liga MX rows: ${rows.length}`);
  const base = run(rows, CONFIGS.shipped);
  for (const [name, a, b] of WINS) {
    const s = summary(base.filter((o) => o.date >= a && o.date < b));
    console.log(`\n${name}: ${s.n} games  1X2 LL ${s.ll.toFixed(4)} (market ${s.mll.toFixed(4)})  draws ${pc(s.draw)} (model ${pc(s.mdraw)})  home wins ${pc(s.home)} (model ${pc(s.mhome)})  picks ${s.picks} hit ${pc(s.hit)} stated ${pc(s.st)}`);
    const by = new Map<string, { n: number; w: number; p: number }>();
    for (const o of base.filter((o) => o.date >= a && o.date < b && o.pick && (o.pick.o === "win" || o.pick.o === "lose"))) {
      const e = by.get(o.pick!.market) ?? { n: 0, w: 0, p: 0 };
      e.n++; e.p += o.pick!.p; if (o.pick!.o === "win") e.w++;
      by.set(o.pick!.market, e);
    }
    for (const [k, e] of [...by].sort((x, y) => y[1].n - x[1].n)) if (e.n >= 8) console.log(`   ${k.padEnd(14)} n=${String(e.n).padStart(4)} hit ${pc(e.w / e.n)} stated ${pc(e.p / e.n)}`);
  }
  console.log("\nconfig comparison (all picks hit | 1X2 LL), by window");
  for (const [name, cfg] of Object.entries(CONFIGS)) {
    const os = name === "shipped" ? base : run(rows, cfg);
    const cells = WINS.map(([, a, b]) => {
      const s = summary(os.filter((o) => o.date >= a && o.date < b));
      return `${pc(s.hit)} (${s.picks}) LL ${s.ll.toFixed(4)}`;
    });
    console.log(`  ${name.padEnd(18)} ${cells.join("   |   ")}`);
  }
}

if (process.argv[1]?.endsWith("audit-ligamx.ts")) main();
