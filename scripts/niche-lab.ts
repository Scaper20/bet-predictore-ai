/**
 * Research only: which markets and leagues the model wins most often in, and
 * whether other maths wins more. Nothing here changes what the site publishes.
 *
 * Stage 1 (--stage=predict, slow) walks forward over every football-data.co.uk
 * division in the catalogue from July 2024: each matchday is predicted from
 * fits on results strictly before it, and every model's view of every match is
 * written to .backtest-cache/niche-preds.json:
 *
 *   dc      the production goals model (Dixon-Coles, shot-weighted), as shipped
 *   pi      pi-ratings (Constantinou & Fenton 2013): a home and an away rating
 *           per club, moved after every match by how wrong the predicted goal
 *           difference was, with diminishing returns on big margins
 *   market  the closing market, de-vigged (1X2, over/under 2.5, Asian line):
 *           what twenty-odd bookmakers agreed on at kick-off
 *   stats   corners, shots and shots on target from the production count
 *           model (negative binomial total, beta-binomial split), and a plain
 *           team-average model beside it
 *
 * Stage 2 (--stage=analyse, fast) reads that file. See analyse() below.
 *
 *   npx tsx scripts/niche-lab.ts --stage=predict
 *   npx tsx scripts/niche-lab.ts --stage=analyse
 */

import fs from "node:fs";
import path from "node:path";
import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { deVig } from "../src/lib/model/backtest";
import { expectStat, fitStat, STAT_OPTIONS, type StatKind, type StatSample } from "../src/lib/model/match-stats";
import { CACHE, csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { analyse } from "./lib/niche-analyse";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const STAT_TRAIN_DAYS = 1000;
const FROM = Date.UTC(2024, 6, 1);
const SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"];
export const PREDS_FILE = path.join(CACHE, "niche-preds.json");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

export const DIVS: { div: string; code: string; label: string }[] = [
  { div: "E0", code: "premier-league", label: "Premier League" },
  { div: "SP1", code: "la-liga", label: "La Liga" },
  { div: "I1", code: "serie-a", label: "Serie A" },
  { div: "D1", code: "bundesliga", label: "Bundesliga" },
  { div: "F1", code: "ligue-1", label: "Ligue 1" },
  { div: "E1", code: "championship", label: "Championship" },
  { div: "N1", code: "eredivisie", label: "Eredivisie" },
  { div: "P1", code: "primeira-liga", label: "Primeira Liga" },
  { div: "SC0", code: "scottish-premiership", label: "Scottish Premiership" },
  { div: "B1", code: "belgian-pro-league", label: "Belgian Pro League" },
  { div: "T1", code: "super-lig", label: "Süper Lig" },
  { div: "G1", code: "greek-super-league", label: "Greek Super League" },
  { div: "E2", code: "league-one", label: "League One" },
  { div: "D2", code: "bundesliga-2", label: "2. Bundesliga" },
  { div: "I2", code: "serie-b", label: "Serie B" },
  { div: "SP2", code: "la-liga-2", label: "La Liga 2" },
  { div: "F2", code: "ligue-2", label: "Ligue 2" },
];

/** Corners, shots, shots on target: [expected home, expected away, NB size, split spread, naive home, naive away, actual home, actual away]. */
export type StatView = [number, number, number, number, number, number, number, number];

export interface Pred {
  d: string;
  t: number;
  h: string;
  a: string;
  hg: number;
  ag: number;
  /** Production goals model: expected goals and the low-score correction. */
  dc: [number, number, number];
  /** Production headline pick, when the fixture was publishable. */
  pub: [string, number] | null;
  /** Pi-ratings predicted goal difference (home minus away). */
  pi: number;
  /** Closing market, de-vigged: home, draw, away, over 2.5. */
  mk: [number, number, number, number] | null;
  /** Closing Asian handicap: home line, de-vigged chance the home side covers. */
  ah: [number, number] | null;
  st: Partial<Record<StatKind, StatView>>;
}

async function load(div: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const season of SEASONS) {
    try {
      rows.push(...parse(await csv(season, div), div));
    } catch {
      // A season the archive does not carry.
    }
  }
  return rows.sort((a, b) => a.date - b.date);
}

/* ------------------------------------------------------------ pi-ratings */

const PI_LAMBDA = 0.035;
const PI_GAMMA = 0.7;
const PI_C = 3;
const piExpect = (r: number) => Math.sign(r) * (Math.pow(10, Math.abs(r) / PI_C) - 1);
const piWeight = (e: number) => Math.sign(e) * PI_C * Math.log10(1 + Math.abs(e));

/** Pre-match pi-rating goal difference for every row, in order. */
function piRatings(rows: Row[]): number[] {
  const home = new Map<string, number>();
  const away = new Map<string, number>();
  return rows.map((r) => {
    const hh = home.get(r.home) ?? 0, ha = away.get(r.home) ?? 0;
    const ah = home.get(r.away) ?? 0, aa = away.get(r.away) ?? 0;
    const g = piExpect(hh) - piExpect(aa);
    const e = r.homeGoals - r.awayGoals - g;
    const w = piWeight(e) * PI_LAMBDA;
    home.set(r.home, hh + w);
    away.set(r.home, ha + PI_GAMMA * w);
    away.set(r.away, aa - w);
    home.set(r.away, ah - PI_GAMMA * w);
    return g;
  });
}

/* ------------------------------------------------------------- the walk */

const STAT_KINDS: StatKind[] = ["corners", "shots", "shotsOnTarget"];

function statSamples(rows: Row[], kind: StatKind): StatSample[] {
  return rows
    .filter((r) => r.stats)
    .map((r) => {
      const [h, a] = kind === "corners" ? r.stats!.corners : kind === "shots" ? r.stats!.shots : r.stats!.shotsOnTarget;
      return { date: r.date, home: r.home, away: r.away, h, a };
    });
}

function predictDiv(d: (typeof DIVS)[number], rows: Row[]): Pred[] {
  const league = { code: d.code, label: d.label };
  const pis = piRatings(rows);
  const samples = Object.fromEntries(STAT_KINDS.map((k) => [k, statSamples(rows, k)])) as Record<StatKind, StatSample[]>;
  const out: Pred[] = [];
  let i = 0;
  let dayKey = -1;
  let fit: ReturnType<typeof fitLeague> | null = null;
  let prior: ReturnType<typeof toResultRow>[] = [];
  const statFits: Partial<Record<StatKind, { fit: ReturnType<typeof fitStat>; avg: Map<string, { f: number; a: number; n: number }> }>> = {};

  rows.forEach((row, idx) => {
    if (row.date < FROM) return;
    const day = Math.floor(row.date / DAY) * DAY;
    if (day !== dayKey) {
      dayKey = day;
      while (i < rows.length && rows[i].date < day) i++;
      prior = rows.slice(Math.max(0, i - TRAIN_CAP), i).map(toResultRow);
      fit = fitLeague(prior);
      for (const k of STAT_KINDS) {
        const train = samples[k].filter((s) => s.date < day && s.date >= day - STAT_TRAIN_DAYS * DAY);
        if (train.length < 200) {
          delete statFits[k];
          continue;
        }
        const avg = new Map<string, { f: number; a: number; n: number }>();
        for (const x of train.filter((t) => t.date >= day - 365 * DAY)) {
          const h = avg.get(x.home) ?? { f: 0, a: 0, n: 0 };
          h.f += x.h; h.a += x.a; h.n++;
          avg.set(x.home, h);
          const a = avg.get(x.away) ?? { f: 0, a: 0, n: 0 };
          a.f += x.a; a.a += x.h; a.n++;
          avg.set(x.away, a);
        }
        statFits[k] = { fit: fitStat(train, day, STAT_OPTIONS[k]), avg };
      }
    }
    const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit! });
    if (!p.sufficiency.publishable) return;

    const st: Pred["st"] = {};
    for (const k of STAT_KINDS) {
      const sf = statFits[k];
      if (!sf) continue;
      const e = expectStat(sf.fit, row.home, row.away);
      const th = sf.avg.get(row.home), ta = sf.avg.get(row.away);
      const ok = th && ta && th.n >= 5 && ta.n >= 5;
      const nh = ok ? (th.f / th.n + ta.a / ta.n) / 2 : sf.fit.muH;
      const na = ok ? (ta.f / ta.n + th.a / th.n) / 2 : sf.fit.muA;
      const actual = row.stats ? (k === "corners" ? row.stats.corners : k === "shots" ? row.stats.shots : row.stats.shotsOnTarget) : [-1, -1];
      st[k] = [e.home, e.away, Number.isFinite(sf.fit.kTotal) ? sf.fit.kTotal : 999, sf.fit.rho, nh, na, actual[0], actual[1]];
    }

    const mk1 = row.close ? deVig([row.close.home, row.close.draw, row.close.away]) : null;
    const mkOu = row.closeOu ? deVig([row.closeOu.over, row.closeOu.under]) : null;
    out.push({
      d: d.div,
      t: row.date,
      h: row.home,
      a: row.away,
      hg: row.homeGoals,
      ag: row.awayGoals,
      dc: [p.markets.expectedGoals.home, p.markets.expectedGoals.away, p.model.rho],
      pub: p.topPick ? [p.topPick.market, p.topPick.probability] : null,
      pi: pis[idx],
      mk: mk1 && mkOu ? [mk1[0], mk1[1], mk1[2], mkOu[0]] : null,
      ah: row.closeAh ? [row.closeAh.line, deVig([row.closeAh.home, row.closeAh.away])[0]] : null,
      st,
    });
  });
  return out;
}

async function predictAll() {
  const all: Pred[] = [];
  for (const d of DIVS) {
    const t0 = Date.now();
    const rows = await load(d.div);
    const preds = predictDiv(d, rows);
    all.push(...preds);
    console.error(`${d.div.padEnd(4)} ${String(preds.length).padStart(5)} fixtures  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  fs.writeFileSync(PREDS_FILE, JSON.stringify(all));
  console.error(`${all.length} fixtures written to ${PREDS_FILE}`);
}

async function main() {
  const stage = arg("stage") ?? "analyse";
  if (stage === "predict") await predictAll();
  else analyse(JSON.parse(fs.readFileSync(PREDS_FILE, "utf8")) as Pred[], process.argv);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
