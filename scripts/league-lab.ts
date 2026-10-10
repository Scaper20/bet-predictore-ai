/**
 * Walk-forward accuracy of the shipped model on candidate competitions,
 * scored the same way for the leagues already live so the numbers compare.
 *
 * For each fixture in the last 12 months: fit on the 1,200 most recent
 * results before that day (production's archive cap, history-store.ts
 * MAX_ROWS), build the prediction through buildPrediction(), and score:
 *
 *   - the published pick (topPick) as the settlement cron would grade it,
 *     the hit rate the track record shows;
 *   - the 1X2 call (the most likely result) against the market favourite
 *     at the close, so a league where results are simply harder to call
 *     reads as such rather than as a weak model;
 *   - the three-way Brier score, model against the de-vigged closing price.
 *
 * Data: football-data.co.uk, the same files production trains these
 * leagues on (per-division season files, or the many-season country files
 * for Argentina, Mexico and MLS).
 *
 * Usage:
 *   npx tsx scripts/league-lab.ts                  # every candidate + baseline
 *   npx tsx scripts/league-lab.ts --cups=<dir>     # European cups, ESPN results
 *   npx tsx scripts/league-lab.ts --only=SC0,B1
 *   npx tsx scripts/league-lab.ts --days=365
 */

import fs from "node:fs";
import path from "node:path";
import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import { deVig } from "../src/lib/model/backtest";
import { CACHE, csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

interface Source {
  id: string;
  label: string;
  /** Per-division season files. */
  div?: string;
  /** Many-season country file and the League column value. */
  country?: { file: string; league: string };
  /** Already live: shown for comparison. */
  baseline?: boolean;
}

const SOURCES: Source[] = [
  { id: "E0", label: "Premier League", div: "E0", baseline: true },
  { id: "SP1", label: "La Liga", div: "SP1", baseline: true },
  { id: "I1", label: "Serie A", div: "I1", baseline: true },
  { id: "D1", label: "Bundesliga", div: "D1", baseline: true },
  { id: "F1", label: "Ligue 1", div: "F1", baseline: true },
  { id: "E1", label: "Championship", div: "E1", baseline: true },
  { id: "N1", label: "Eredivisie", div: "N1", baseline: true },
  { id: "P1", label: "Primeira Liga", div: "P1", baseline: true },
  { id: "SC0", label: "Scottish Premiership", div: "SC0" },
  { id: "B1", label: "Belgian Pro League", div: "B1" },
  { id: "T1", label: "Turkish Süper Lig", div: "T1" },
  { id: "G1", label: "Greek Super League", div: "G1" },
  { id: "E2", label: "League One", div: "E2" },
  { id: "D2", label: "2. Bundesliga", div: "D2" },
  { id: "SP2", label: "La Liga 2", div: "SP2" },
  { id: "I2", label: "Serie B", div: "I2" },
  { id: "F2", label: "Ligue 2", div: "F2" },
  { id: "ARG", label: "Argentina Liga Profesional", country: { file: "ARG", league: "Liga Profesional" } },
  { id: "MEX", label: "Liga MX", country: { file: "MEX", league: "Liga MX" } },
  { id: "USA", label: "MLS", country: { file: "USA", league: "MLS" } },
];

const SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"];
const TRAIN_CAP = Number(process.argv.find((a) => a.startsWith("--cap="))?.split("=")[1] ?? 1200);
const DAY = 86_400_000;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
/** Fit overrides for experiments, e.g. --newcomer=0 to drop the promoted-club prior. */
const FIT_OPTIONS = arg("newcomer") !== undefined ? { newcomerPrior: Number(arg("newcomer")) } : {};
const WINDOW_DAYS = Number(arg("window") ?? 0);

async function countryFile(file: string): Promise<string> {
  fs.mkdirSync(CACHE, { recursive: true });
  const p = path.join(CACHE, `country-${file}.csv`);
  // The country files grow every matchday; a day-old copy is fine.
  if (fs.existsSync(p) && Date.now() - fs.statSync(p).mtimeMs < DAY) return fs.readFileSync(p, "utf8");
  const r = await fetch(`https://www.football-data.co.uk/new/${file}.csv`);
  if (!r.ok) throw new Error(`${file}.csv → ${r.status}`);
  const body = await r.text();
  fs.writeFileSync(p, body);
  return body;
}

/** The country-file shape: Home/Away/HG/AG, closing prices only. */
function parseCountry(body: string, id: string, league: string): Row[] {
  const lines = body.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const h = lines[0].split(",").map((s) => s.trim());
  const at = (n: string) => h.indexOf(n);
  const [iL, iD, iT, iH, iA, iHg, iAg] = ["League", "Date", "Time", "Home", "Away", "HG", "AG"].map(at);
  const [iCh, iCd, iCa] = ["AvgCH", "AvgCD", "AvgCA"].map(at);
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    // The file's League column carries a stray trailing space in places.
    if ((f[iL] ?? "").trim() !== league) continue;
    const hg = Number(f[iHg]), ag = Number(f[iAg]);
    if (f[iHg]?.trim() === "" || f[iAg]?.trim() === "" || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const [d, m, y] = (f[iD] ?? "").split("/");
    if (!d || !m || !y) continue;
    const [hh, mm] = (f[iT] ?? "15:00").split(":");
    const date = Date.UTC(y.length === 2 ? 2000 + Number(y) : Number(y), Number(m) - 1, Number(d), Number(hh) || 15, Number(mm) || 0);
    const ch = Number(f[iCh]), cd = Number(f[iCd]), ca = Number(f[iCa]);
    rows.push({
      div: id,
      date,
      home: f[iH].trim(),
      away: f[iA].trim(),
      homeGoals: hg,
      awayGoals: ag,
      close: ch > 1 && cd > 1 && ca > 1 ? { home: ch, draw: cd, away: ca } : undefined,
    });
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
      // A season the archive doesn't carry (a division it added later).
    }
  }
  return rows.sort((a, b) => a.date - b.date);
}

interface Score {
  label: string;
  baseline: boolean;
  fixtures: number;
  history: number;
  picks: number;
  pickWins: number;
  pickLosses: number;
  declined: number;
  called: number;
  modelRight: number;
  marketRight: number;
  modelBrier: number;
  marketBrier: number;
  brierN: number;
}

const brier = (p: [number, number, number], o: number) =>
  p.reduce((a, v, i) => a + (v - (i === o ? 1 : 0)) ** 2, 0);

function score(
  s: { id: string; label: string; baseline?: boolean },
  rows: Row[],
  days: number,
  /** Train on this instead of `rows` (a cup rated on every European cup). */
  pool: Row[] = rows,
): Score {
  const all = pool;
  const end = Date.now();
  const target = rows.filter((r) => r.date >= end - days * DAY && r.date <= end);
  const out: Score = {
    label: s.label, baseline: Boolean(s.baseline), fixtures: target.length, history: all.length,
    picks: 0, pickWins: 0, pickLosses: 0, declined: 0,
    called: 0, modelRight: 0, marketRight: 0, modelBrier: 0, marketBrier: 0, brierN: 0,
  };
  const league = { code: `lab-${s.id.toLowerCase()}`, label: s.label };
  const fits = new Map<number, ReturnType<typeof fitLeague>>();
  let i = 0;
  for (const row of target) {
    const day = Math.floor(row.date / DAY) * DAY;
    // Strictly before the day: no result from the same matchday leaks in.
    while (i < all.length && all[i].date < day) i++;
    let from = Math.max(0, i - TRAIN_CAP);
    // --window: train only on results from the last N days (cups).
    while (WINDOW_DAYS && from < i && all[from].date < day - WINDOW_DAYS * DAY) from++;
    const prior = all.slice(from, i).map(toResultRow);
    let fit = fits.get(day);
    if (!fit) {
      fit = fitLeague(prior, FIT_OPTIONS);
      fits.set(day, fit);
    }
    const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit });

    const o = row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
    const probs: [number, number, number] = [p.markets.home, p.markets.draw, p.markets.away];
    out.called++;
    if (probs.indexOf(Math.max(...probs)) === o) out.modelRight++;
    if (row.close) {
      const m = deVig([row.close.home, row.close.draw, row.close.away]) as [number, number, number];
      if (m.indexOf(Math.max(...m)) === o) out.marketRight++;
      out.modelBrier += brier(probs, o);
      out.marketBrier += brier(m, o);
      out.brierN++;
    }

    if (!p.sufficiency.publishable || !p.topPick) {
      out.declined++;
      continue;
    }
    const graded = evaluatePick(p.topPick.market, row.homeGoals, row.awayGoals);
    if (!graded || graded === "push") continue;
    out.picks++;
    if (graded === "win") out.pickWins++;
    else out.pickLosses++;
  }
  return out;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—").padStart(6);

/**
 * European cups, from ESPN scoreboard results saved one JSON file per
 * competition ({comp, date, home, away, hg, ag}). football-data.co.uk has no
 * cup files, so these carry no closing price and no market columns.
 */
const CUPS = [
  { id: "uefa.champions", label: "Champions League", baseline: true },
  { id: "uefa.europa", label: "Europa League" },
  { id: "uefa.europa.conf", label: "Conference League" },
];

function loadCup(dir: string, id: string): Row[] {
  const p = path.join(dir, `${id}.json`);
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { date: string; home: string; away: string; hg: number; ag: number }[];
  return raw
    .map((r) => ({ div: id, date: Date.parse(r.date), home: r.home, away: r.away, homeGoals: r.hg, awayGoals: r.ag }))
    .sort((a, b) => a.date - b.date);
}

async function main() {
  const only = arg("only")?.split(",");
  const days = Number(arg("days") ?? 365);
  const cupDir = arg("cups");
  const scores: Score[] = [];
  if (cupDir) {
    const rows = new Map(CUPS.map((c) => [c.id, loadCup(cupDir, c.id)]));
    const pooled = [...rows.values()].flat().sort((a, b) => a.date - b.date);
    for (const c of CUPS) {
      scores.push(score(c, rows.get(c.id)!, days));
      scores.push(score({ ...c, label: `${c.label} (all cups)` }, rows.get(c.id)!, days, pooled));
    }
  } else {
    for (const s of SOURCES.filter((x) => !only || only.includes(x.id))) {
      process.stderr.write(`${s.id}… `);
      scores.push(score(s, await load(s), days));
    }
    process.stderr.write("\n");
  }

  const header =
    "league                        fixtures  history | picks  pick hit | 1X2 model  market | Brier model  market";
  for (const group of [true, false]) {
    const rows = scores.filter((x) => x.baseline === group);
    if (!rows.length) continue;
    console.log(`\n${group ? "LIVE TODAY (baseline)" : "CANDIDATES"}`);
    console.log(header);
    for (const x of rows) {
      console.log(
        `${x.label.padEnd(29)} ${String(x.fixtures).padStart(8)} ${String(x.history).padStart(8)} | ` +
          `${String(x.picks).padStart(5)}  ${pct(x.pickWins, x.picks)}  | ` +
          `${pct(x.modelRight, x.called)}  ${pct(x.marketRight, x.brierN)} | ` +
          `${x.brierN ? (x.modelBrier / x.brierN).toFixed(4) : "     —"}  ${x.brierN ? (x.marketBrier / x.brierN).toFixed(4) : "     —"}`,
      );
    }
    const t = rows.reduce(
      (a, x) => ({ p: a.p + x.picks, w: a.w + x.pickWins, c: a.c + x.called, r: a.r + x.modelRight, m: a.m + x.marketRight, n: a.n + x.brierN }),
      { p: 0, w: 0, c: 0, r: 0, m: 0, n: 0 },
    );
    console.log(`${"all".padEnd(29)} ${" ".repeat(17)} | ${String(t.p).padStart(5)}  ${pct(t.w, t.p)}  | ${pct(t.r, t.c)}  ${pct(t.m, t.n)} |`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
