/**
 * Research: should each league get its own draw and goals correction?
 *
 * The 13 Oct 2026 audit of Strike 2's live record had "home or away" picks
 * losing to draws in MLS, Liga MX and the Bundesliga, and over/under picks
 * missing in Brazil, La Liga 2 and the Premier League. Every league already
 * has its own fit (scoring level, home advantage, Dixon-Coles rho), so this
 * tests two corrections on top, both measured from the training rows only:
 *
 *   draw   how far the league's real draw share sits from the share the fit
 *          gives its own training games; drawn scorelines are scaled by
 *          (observed + c) / (predicted + c), c a pseudo-count of draws.
 *   goals  the same for total goals over the recent weeks (half-life h days),
 *          applied as a scale on both expected goal rates.
 *
 * Walk-forward: each fixture is predicted from a fit on results strictly
 * before its matchday, exactly as league-lab.ts does. Scored on 1X2 log loss,
 * draw calibration, over/under log loss and the published pick.
 *
 *   npx tsx scripts/calibration-lab.ts --from=365 --to=0     # last 12 months
 *   npx tsx scripts/calibration-lab.ts --from=730 --to=365   # the year before
 */

import fs from "node:fs";
import path from "node:path";
import { buildPrediction, TOTALS_SHRINK } from "../src/lib/model/predict";
import { expectedRates, fitLeague, type LeagueFit } from "../src/lib/model/fit";
import { scoreMatrix } from "../src/lib/model/poisson";
import { evaluatePick } from "../src/lib/settlement";
import type { ResultRow } from "../src/lib/types";
import { CACHE, csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

interface Source {
  id: string;
  label: string;
  div?: string;
  country?: { file: string; league: string };
}

const SOURCES: Source[] = [
  { id: "E0", label: "Premier League", div: "E0" },
  { id: "SP1", label: "La Liga", div: "SP1" },
  { id: "I1", label: "Serie A", div: "I1" },
  { id: "D1", label: "Bundesliga", div: "D1" },
  { id: "F1", label: "Ligue 1", div: "F1" },
  { id: "E1", label: "Championship", div: "E1" },
  { id: "N1", label: "Eredivisie", div: "N1" },
  { id: "P1", label: "Primeira Liga", div: "P1" },
  { id: "SC0", label: "Scottish Premiership", div: "SC0" },
  { id: "B1", label: "Belgian Pro League", div: "B1" },
  { id: "T1", label: "Turkish Super Lig", div: "T1" },
  { id: "G1", label: "Greek Super League", div: "G1" },
  { id: "E2", label: "League One", div: "E2" },
  { id: "D2", label: "2. Bundesliga", div: "D2" },
  { id: "SP2", label: "La Liga 2", div: "SP2" },
  { id: "I2", label: "Serie B", div: "I2" },
  { id: "F2", label: "Ligue 2", div: "F2" },
  { id: "ARG", label: "Argentina", country: { file: "ARG", league: "Liga Profesional" } },
  { id: "MEX", label: "Liga MX", country: { file: "MEX", league: "Liga MX" } },
  { id: "USA", label: "MLS", country: { file: "USA", league: "MLS" } },
  { id: "BRA", label: "Brazil Serie A", country: { file: "BRA", league: "Serie A" } },
];
const SEASONS = ["2021", "2122", "2223", "2324", "2425", "2526", "2627"];

async function countryFile(file: string): Promise<string> {
  fs.mkdirSync(CACHE, { recursive: true });
  const p = path.join(CACHE, `country-${file}.csv`);
  if (fs.existsSync(p) && Date.now() - fs.statSync(p).mtimeMs < 3 * DAY) return fs.readFileSync(p, "utf8");
  const r = await fetch(`https://www.football-data.co.uk/new/${file}.csv`);
  if (!r.ok) throw new Error(`${file}.csv -> ${r.status}`);
  const body = await r.text();
  fs.writeFileSync(p, body);
  return body;
}

function parseCountry(body: string, id: string, league: string): Row[] {
  const lines = body.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0].split(",").map((s) => s.trim());
  const at = (n: string) => h.indexOf(n);
  const [iL, iD, iT, iH, iA, iHg, iAg] = ["League", "Date", "Time", "Home", "Away", "HG", "AG"].map(at);
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if ((f[iL] ?? "").trim() !== league) continue;
    const hg = Number(f[iHg]), ag = Number(f[iAg]);
    if (f[iHg]?.trim() === "" || f[iAg]?.trim() === "" || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const [d, m, y] = (f[iD] ?? "").split("/");
    if (!d || !m || !y) continue;
    const [hh, mm] = (f[iT] ?? "15:00").split(":");
    const date = Date.UTC(y.length === 2 ? 2000 + Number(y) : Number(y), Number(m) - 1, Number(d), Number(hh) || 15, Number(mm) || 0);
    rows.push({ div: id, date, home: f[iH].trim(), away: f[iA].trim(), homeGoals: hg, awayGoals: ag });
  }
  return rows.sort((a, b) => a.date - b.date);
}

async function load(s: Source): Promise<Row[]> {
  if (s.country) return parseCountry(await countryFile(s.country.file), s.id, s.country.league);
  const rows: Row[] = [];
  for (const season of SEASONS) {
    try {
      rows.push(...parse(await csv(season, s.div!), s.div!));
    } catch {
      // A season the archive doesn't carry.
    }
  }
  return rows.sort((a, b) => a.date - b.date);
}

/** The draw share and goal level the fit implies for its own training games, against what happened. */
interface TrainingGap {
  drawObs: number;
  drawPred: number;
  goalObs: number;
  goalPred: number;
  goalN: number;
}

function trainingGap(prior: ResultRow[], fit: LeagueFit, now: number, drawHalfLife: number, goalHalfLife: number): TrainingGap {
  const out: TrainingGap = { drawObs: 0, drawPred: 0, goalObs: 0, goalPred: 0, goalN: 0 };
  const dDecay = Math.log(2) / (drawHalfLife * DAY);
  const gDecay = Math.log(2) / (goalHalfLife * DAY);
  const mean = 2 * fit.observedGoalRate;
  for (const r of prior) {
    const { lambda, mu } = expectedRates(fit, r.homeName, r.awayName);
    // The production totals shrink, so the comparison is against what the site would show.
    const total = lambda + mu;
    const scale = (mean + TOTALS_SHRINK * (total - mean)) / total;
    const l = lambda * scale, m = mu * scale;
    const g = scoreMatrix(l, m, fit.rho);
    let pd = 0;
    for (let i = 0; i < g.length; i++) pd += g[i][i];
    const age = Math.max(0, now - r.date);
    const wd = Math.exp(-dDecay * age);
    const wg = Math.exp(-gDecay * age);
    out.drawObs += wd * (r.homeGoals === r.awayGoals ? 1 : 0);
    out.drawPred += wd * pd;
    out.goalObs += wg * (r.homeGoals + r.awayGoals);
    out.goalPred += wg * (l + m);
    out.goalN += wg;
  }
  return out;
}

interface Variant {
  name: string;
  drawC?: number;
  goalC?: number;
  /** One draw factor for every league, instead of one measured per league. */
  drawFixed?: number;
}
const ALL_VARIANTS: Variant[] = [
  { name: "base" },
  { name: "draw x1.03", drawFixed: 1.03 },
  { name: "draw x1.05", drawFixed: 1.05 },
  { name: "draw c=30", drawC: 30 },
  { name: "draw c=100", drawC: 100 },
  { name: "goals c=20", goalC: 20 },
  { name: "goals c=60", goalC: 60 },
  { name: "both 30/60", drawC: 30, goalC: 60 },
];
/** --variants=base,draw x1.03 runs a subset. */
const VARIANTS = arg("variants") ? ALL_VARIANTS.filter((v) => arg("variants")!.split(",").includes(v.name)) : ALL_VARIANTS;

interface Tally {
  n: number;
  ll: number;
  drawP: number;
  draws: number;
  ou: Record<string, number>;
  picks: number;
  wins: number;
  pickP: number;
  fam: Record<string, { n: number; w: number; p: number }>;
  factors: { d: number; g: number; k: number };
}
const blank = (): Tally => ({ n: 0, ll: 0, drawP: 0, draws: 0, ou: { "1.5": 0, "2.5": 0, "3.5": 0 }, picks: 0, wins: 0, pickP: 0, fam: {}, factors: { d: 0, g: 0, k: 0 } });

function run(s: Source, rows: Row[], fromDays: number, toDays: number, drawHalfLife: number, goalHalfLife: number): Map<string, Tally> {
  const end = Date.now();
  const target = rows.filter((r) => r.date >= end - fromDays * DAY && r.date < end - toDays * DAY);
  const tallies = new Map(VARIANTS.map((v) => [v.name, blank()]));
  const league = { code: `lab-${s.id.toLowerCase()}`, label: s.label };
  const cache = new Map<number, { fit: LeagueFit; prior: ResultRow[]; gap: TrainingGap }>();
  let i = 0;
  for (const row of target) {
    const day = Math.floor(row.date / DAY) * DAY;
    while (i < rows.length && rows[i].date < day) i++;
    let c = cache.get(day);
    if (!c) {
      const prior = rows.slice(Math.max(0, i - TRAIN_CAP), i).map(toResultRow);
      if (prior.length < 200) continue;
      const fit = fitLeague(prior);
      c = { fit, prior, gap: trainingGap(prior, fit, day, drawHalfLife, goalHalfLife) };
      cache.set(day, c);
    }
    const o = row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
    const goals = row.homeGoals + row.awayGoals;
    for (const v of VARIANTS) {
      const t = tallies.get(v.name)!;
      const gp = c.gap.goalPred, gn = c.gap.goalN;
      const d = v.drawFixed ?? (v.drawC ? (c.gap.drawObs + v.drawC) / (c.gap.drawPred + v.drawC) : 1);
      const g = v.goalC ? (c.gap.goalObs + v.goalC * (gp / gn)) / (gp + v.goalC * (gp / gn)) : 1;
      const p = buildPrediction(toMatch(row, league), c.prior, [], { prefit: c.fit, drawInflation: d, goalScale: g });
      const probs = [p.markets.home, p.markets.draw, p.markets.away];
      t.n++;
      t.ll -= Math.log(Math.max(1e-9, probs[o]));
      t.drawP += p.markets.draw;
      t.draws += o === 1 ? 1 : 0;
      for (const line of ["1.5", "2.5", "3.5"]) {
        const po = p.markets.over[line];
        t.ou[line] -= Math.log(Math.max(1e-9, goals > Number(line) ? po : 1 - po));
      }
      t.factors.d += d;
      t.factors.g += g;
      t.factors.k++;
      if (!p.sufficiency.publishable || !p.topPick) continue;
      const graded = evaluatePick(p.topPick.market, row.homeGoals, row.awayGoals);
      if (!graded || graded === "push") continue;
      const win = graded === "win" ? 1 : 0;
      t.picks++;
      t.wins += win;
      t.pickP += p.topPick.probability;
      const fam = p.topPick.market.split(":").slice(0, 2).join(":");
      const f = (t.fam[fam] ??= { n: 0, w: 0, p: 0 });
      f.n++;
      f.w += win;
      f.p += p.topPick.probability;
    }
  }
  return tallies;
}

const f3 = (v: number) => v.toFixed(4);
const pc = (v: number) => `${(100 * v).toFixed(1)}%`;

async function main() {
  const fromDays = Number(arg("from") ?? 365);
  const toDays = Number(arg("to") ?? 0);
  const drawHalfLife = Number(arg("dhl") ?? 365);
  const goalHalfLife = Number(arg("ghl") ?? 90);
  const only = arg("only")?.split(",");
  const pooled = new Map(VARIANTS.map((v) => [v.name, blank()]));
  console.log(`window ${fromDays}->${toDays} days ago; draw half-life ${drawHalfLife}d, goals half-life ${goalHalfLife}d\n`);
  console.log("league                 variant       n    1X2 LL   draw pred/real   OU1.5    OU2.5    OU3.5  picks  hit    claimed  mean d  mean g");
  for (const s of SOURCES.filter((x) => !only || only.includes(x.id))) {
    process.stderr.write(`${s.id} `);
    const rows = await load(s);
    const res = run(s, rows, fromDays, toDays, drawHalfLife, goalHalfLife);
    for (const v of VARIANTS) {
      const t = res.get(v.name)!;
      const P = pooled.get(v.name)!;
      P.n += t.n; P.ll += t.ll; P.drawP += t.drawP; P.draws += t.draws;
      for (const k of Object.keys(t.ou)) P.ou[k] += t.ou[k];
      P.picks += t.picks; P.wins += t.wins; P.pickP += t.pickP;
      P.factors.d += t.factors.d; P.factors.g += t.factors.g; P.factors.k += t.factors.k;
      for (const [k, f] of Object.entries(t.fam)) {
        const q = (P.fam[k] ??= { n: 0, w: 0, p: 0 });
        q.n += f.n; q.w += f.w; q.p += f.p;
      }
      if (!t.n) continue;
      console.log(
        `${s.label.padEnd(22)} ${v.name.padEnd(11)} ${String(t.n).padStart(5)}  ${f3(t.ll / t.n)}   ${pc(t.drawP / t.n)}/${pc(t.draws / t.n)}   ` +
          `${f3(t.ou["1.5"] / t.n)}  ${f3(t.ou["2.5"] / t.n)}  ${f3(t.ou["3.5"] / t.n)}  ${String(t.picks).padStart(5)}  ${pc(t.wins / Math.max(1, t.picks))}  ` +
          `${pc(t.pickP / Math.max(1, t.picks))}   ${(t.factors.d / t.factors.k).toFixed(3)}  ${(t.factors.g / t.factors.k).toFixed(3)}`,
      );
    }
  }
  process.stderr.write("\n");
  console.log("\nPOOLED");
  for (const v of VARIANTS) {
    const t = pooled.get(v.name)!;
    console.log(
      `${"all".padEnd(22)} ${v.name.padEnd(11)} ${String(t.n).padStart(5)}  ${f3(t.ll / t.n)}   ${pc(t.drawP / t.n)}/${pc(t.draws / t.n)}   ` +
        `${f3(t.ou["1.5"] / t.n)}  ${f3(t.ou["2.5"] / t.n)}  ${f3(t.ou["3.5"] / t.n)}  ${String(t.picks).padStart(5)}  ${pc(t.wins / t.picks)}  ${pc(t.pickP / t.picks)}`,
    );
  }
  console.log("\nPICKS BY MARKET (pooled): hit / claimed (n)");
  const fams = [...new Set(VARIANTS.flatMap((v) => Object.keys(pooled.get(v.name)!.fam)))].sort();
  for (const fam of fams) {
    const cells = VARIANTS.map((v) => {
      const f = pooled.get(v.name)!.fam[fam];
      return f ? `${pc(f.w / f.n)}/${pc(f.p / f.n)} (${f.n})` : "—";
    });
    console.log(`${fam.padEnd(16)} ${cells.map((c) => c.padEnd(22)).join("")}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
