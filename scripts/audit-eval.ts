/**
 * Shared walk-forward harness for the Nov 2026 audit (docs/model-audit-teams-2026-11.md).
 *
 * One rule for every config: each fixture is predicted from a fit on results
 * strictly before its matchday (training capped at the last 1,200 rows, the
 * way decision-lab.ts does), through the same buildPrediction the site calls.
 * Writes one JSON record per fixture so configs can be compared PAIRED on the
 * same fixtures (scripts/audit-report.ts).
 *
 *   npx tsx scripts/audit-eval.ts --cfg=legacy --from=2023-08-01 --to=2026-06-30 --out=/tmp/x.json
 *
 * Configs live in CONFIGS below; a config is plain ModelOptions plus the
 * `fitOpts` that go to fitLeague. Dates are UTC, inclusive of --from, and
 * exclusive of the day after --to.
 */

import fs from "node:fs";
import { buildPrediction, type ModelOptions } from "../src/lib/model/predict";
import { fitLeague, type FitOptions } from "../src/lib/model/fit";
import { NEXT_PARAMS } from "../src/lib/model/params";
import { evaluatePick } from "../src/lib/settlement";
import { csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { clampEnd } from "./lib/holdout";
import { deVig } from "../src/lib/model/backtest";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const SEASONS = ["2021", "2122", "2223", "2324", "2425", "2526", "2627"].filter((s) => s !== "2021");

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

type Config = ModelOptions & { fitOpts?: FitOptions; useMarketTotal?: number };

export const CONFIGS: Record<string, Config> = {
  legacy: {},
  // What ships for games from 5 Nov 2026 (model/params.ts), through the real buildPrediction.
  next: { ...NEXT_PARAMS.options, fitOpts: NEXT_PARAMS.fit },
  // Audit section E candidates, existing knobs only.
  reg005: { fitOpts: { regularisation: 0.005 } },
  reg0025: { fitOpts: { regularisation: 0.0025 } },
  st11: { strengthStretch: 1.1 },
  st12: { strengthStretch: 1.2 },
  reg005_st11: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1 },
  reg005_st12: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.2 },
  reg0025_st11: { fitOpts: { regularisation: 0.0025 }, strengthStretch: 1.1 },
  // Scoring-level drift.
  lvl90: { levelAdjust: { halfLifeDays: 90, weight: 0.5 } },
  lvl60: { levelAdjust: { halfLifeDays: 60, weight: 0.5 } },
  combo_lvl90: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1, levelAdjust: { halfLifeDays: 90, weight: 0.5 } },
  // Favour overs (owner's request): ranking tilt and a lower bar for over 2.5.
  combo_o02: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1, overTilt: 0.02 },
  combo_o04: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1, overTilt: 0.04 },
  combo_o04_m65: { fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1, overTilt: 0.04, minProbability: { "ou:over:2.5": 0.65 } },
  // Ranker-only picks (sweet spots off) so a pick layer can be refitted offline (scripts/audit-layer.ts).
  ns_legacy: { sweetSpots: false },
  ns_legacy_o02: { sweetSpots: false, overTilt: 0.02 },
  ns_c11: { sweetSpots: false, fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1 },
  ns_c11_o02: { sweetSpots: false, fitOpts: { regularisation: 0.005 }, strengthStretch: 1.1, overTilt: 0.02 },
  ns_c12: { sweetSpots: false, fitOpts: { regularisation: 0.005 }, strengthStretch: 1.2 },
  ns_c12_o02: { sweetSpots: false, fitOpts: { regularisation: 0.005 }, strengthStretch: 1.2, overTilt: 0.02 },
  ns_st11: { sweetSpots: false, strengthStretch: 1.1 },
  // Market-informed totals: the closing over 2.5 sets the total (an upper bound on what a publish-time price gives).
  mt1: { useMarketTotal: 1 },
  mt05: { useMarketTotal: 0.5 },
  ns_mt1: { sweetSpots: false, useMarketTotal: 1 },
  ns_mt05: { sweetSpots: false, useMarketTotal: 0.5 },
  legacy_o02: { overTilt: 0.02 },
  legacy_o04: { overTilt: 0.04 },
  legacy_o04_m65: { overTilt: 0.04, minProbability: { "ou:over:2.5": 0.65 } },
};

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
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

/** Selections kept per fixture so a pick layer can be refitted offline. */
const KEEP = /^(1x2|dc|btts|ou:(over|under):(0\.5|1\.5|2\.5|3\.5|4\.5)|ah:(home|away):-?\d+(\.5)?$)/;

export interface Rec {
  div: string;
  date: number;
  hg: number;
  ag: number;
  close?: [number, number, number];
  closeOu?: [number, number];
  /** Model chance of every kept selection, by market id. */
  p: Record<string, number>;
  /** Whole-line handicap chances as win/(win+loss), keyed like the sweet-spot rules read them. */
  lambda: [number, number];
  /** Effective training sample: the rows' weights added up at the 180-day half-life (what the fit really learns from). */
  eff: number;
  pick?: { market: string; prob: number; outcome: "win" | "lose" | "push" | null; conf: number; sweet: boolean };
}

async function main() {
  const name = arg("cfg") ?? "legacy";
  const cfg = CONFIGS[name];
  if (!cfg) throw new Error(`unknown config ${name}`);
  const from = Date.parse(arg("from") ?? "2023-08-01");
  // Stops at 31 Oct 2026 unless --final: the frozen holdout (scripts/lib/holdout.ts).
  const to = Date.parse(clampEnd(arg("to") ?? "2026-06-30", process.argv.includes("--final"))) + DAY;
  const only = arg("only")?.split(",");
  const out: Rec[] = [];
  const { fitOpts, useMarketTotal, ...options } = cfg;

  for (const d of DIVS) {
    if (only && !only.includes(d.div)) continue;
    const rows = await load(d.div);
    const league = { code: d.code, label: d.label };
    const target = rows.filter((r) => r.date >= from && r.date < to);
    const fits = new Map<number, ReturnType<typeof fitLeague>>();
    let i = 0;
    for (const row of target) {
      const day = Math.floor(row.date / DAY) * DAY;
      while (i < rows.length && rows[i].date < day) i++;
      const prior = rows.slice(Math.max(0, i - TRAIN_CAP), i).map(toResultRow);
      let fit = fits.get(day);
      if (!fit) {
        fit = fitLeague(prior, fitOpts);
        fits.set(day, fit);
      }
      const overFair = useMarketTotal && row.closeOu ? deVig([row.closeOu.over, row.closeOu.under])[0] : null;
      const p = buildPrediction(toMatch(row, league), prior, [], { ...options, prefit: fit, ...(overFair !== null ? { marketOver25: overFair, marketTotalWeight: useMarketTotal } : {}) });
      let eff = 0;
      for (const r of prior) eff += Math.exp((-Math.LN2 * (day - r.date)) / (180 * DAY));
      if (!p.sufficiency.publishable) continue;
      const kept: Record<string, number> = {};
      for (const pk of p.picks) if (KEEP.test(pk.market)) kept[pk.market] = pk.probability;
      for (const l of p.asianHandicap) {
        kept[`ah:home:${l.line}`] = l.home;
        kept[`ah:away:${-l.line}`] = l.away;
        kept[`ahpush:${l.line}`] = l.push;
      }
      const top = p.topPick;
      out.push({
        div: d.div,
        date: row.date,
        hg: row.homeGoals,
        ag: row.awayGoals,
        close: row.close ? [row.close.home, row.close.draw, row.close.away] : undefined,
        closeOu: row.closeOu ? [row.closeOu.over, row.closeOu.under] : undefined,
        p: kept,
        lambda: [p.markets.expectedGoals.home, p.markets.expectedGoals.away],
        eff,
        pick: top
          ? {
              market: top.market,
              prob: top.probability,
              outcome: evaluatePick(top.market, row.homeGoals, row.awayGoals),
              conf: top.confidence,
              sweet: Boolean(p.sweetSpot),
            }
          : undefined,
      });
    }
    process.stderr.write(`${name} ${d.div}: ${out.length} so far\n`);
  }
  fs.writeFileSync(arg("out") ?? `/tmp/audit-${name}.json`, JSON.stringify(out));
}

if (process.argv[1]?.endsWith("audit-eval.ts")) void main();
