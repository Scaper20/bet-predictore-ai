/**
 * The Code Hub walk-forward shared by the hub labs (league-form-lab.ts,
 * team-form-lab.ts): every football-data.co.uk division predicted from results
 * strictly before each matchday, and each game's hub pool built the way
 * production builds it (code-hub-feed.ts: hub markets, 60% floor, legs the
 * market rates 5pt+ below the model dropped, the closing price standing in for
 * SportyBet's).
 */

import { buildPrediction, type Prediction } from "../../src/lib/model/predict";
import { fitLeague } from "../../src/lib/model/fit";
import { evaluatePick } from "../../src/lib/settlement";
import { candidatesFor, type PoolEntry } from "../../src/lib/forge";
import { buildHub, hubMarketAllowed, hubTier, HUB_FORGE_MARKETS, HUB_LEG_MIN_PROBABILITY, HUB_LIVE_TIERS, type HubBuildOptions } from "../../src/lib/code-hub";
import { isQuotable } from "../../src/lib/odds/markets";
import { twinsOf } from "../../src/lib/odds/bookable";
import { csv, parse, priceFor, toMatch, toResultRow, type Row } from "./football-data-uk";
import { clampEnd } from "./holdout";

export const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const SEASONS = ["2021", "2122", "2223", "2324", "2425", "2526", "2627"];
export const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

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

export interface Graded {
  day: number;
  code: string;
  row: Row;
  p: Prediction;
}

export async function load(div: string): Promise<Row[]> {
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

export function walk(d: (typeof DIVS)[number], rows: Row[], days: number): Graded[] {
  const end = Math.min(Date.now(), Date.parse(clampEnd(undefined, process.argv.includes("--final"))) + DAY);
  const target = rows.filter((r) => r.date >= end - days * DAY && r.date <= end);
  const league = { code: d.code, label: d.label };
  const fits = new Map<number, ReturnType<typeof fitLeague>>();
  const out: Graded[] = [];
  let i = 0;
  for (const row of target) {
    const day = Math.floor(row.date / DAY) * DAY;
    while (i < rows.length && rows[i].date < day) i++;
    const prior = rows.slice(Math.max(0, i - TRAIN_CAP), i).map(toResultRow);
    let fit = fits.get(day);
    if (!fit) {
      fit = fitLeague(prior);
      fits.set(day, fit);
    }
    const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit });
    if (!p.sufficiency.publishable) continue;
    out.push({ day, code: d.code, row, p });
  }
  return out;
}

export const won = (market: string, r: Row) => evaluatePick(market, r.homeGoals, r.awayGoals);

export function closingPrice(market: string, r: Row): number | undefined {
  for (const m of [market, ...twinsOf(market).map((t) => t.market)]) {
    const p = priceFor(m, r).price;
    if (p !== undefined && p > 1) return p;
  }
  return undefined;
}

export function closingChance(market: string, r: Row): number | null {
  for (const m of [market, ...twinsOf(market).map((t) => t.market)]) {
    const p = priceFor(m, r).marketProbability;
    if (p !== undefined && p > 0) return p;
  }
  return null;
}

/** The hub's pool for one game, as production builds it (market check 5pt, closing prices). */
export function candidates(g: Graded) {
  return candidatesFor(g.p, { markets: HUB_FORGE_MARKETS, picksPerGame: 1, allowHandicap: true })
    .filter((c) => isQuotable(c.market) && hubMarketAllowed(c.market) && c.probability >= HUB_LEG_MIN_PROBABILITY)
    .filter((c) => {
      const m = closingChance(c.market, g.row);
      return m === null || m > c.probability - 0.05;
    })
    .map((c) => ({ ...c, price: closingPrice(c.market, g.row) ?? null }));
}

