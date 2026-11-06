/**
 * Improvement search, step 1: one walk-forward pass that records, for every
 * fixture in a division, what each model variant says (its two goal rates and
 * its low-score parameter after the production pipeline) next to what the
 * market said (closing and earlier-in-the-week prices) and what happened. All
 * the blending, market anchoring and pick-policy experiments (improve-*.ts)
 * then run on these records without refitting anything.
 *
 *   npx tsx scripts/improve-lab.ts --div=E0 --out=<file.json> [--xg=<a.jsonl>,<b.jsonl>]
 *
 * Fit on results before each matchday (1,200-row cap), the way every lab does it.
 * Stops at 31 Oct 2026 (frozen holdout, scripts/lib/holdout.ts) unless --final.
 */
import fs from "node:fs";
import path from "node:path";
import { buildPrediction, type ModelOptions } from "../src/lib/model/predict";
import { fitLeague, type FitOptions } from "../src/lib/model/fit";
import { csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { clampEnd } from "./lib/holdout";
import { loadXgRows, makeXgMatcher } from "./lib/xg-lookup";
import { DIVS } from "./audit-eval";
import { fair3, fairOu, impliedRates } from "./lib/improve-core";

const DAY = 86_400_000;
const FOTMOB: Record<string, number> = { E0: 47, SP1: 87, I1: 55, D1: 54, F1: 53, E1: 48, N1: 57, P1: 61, SC0: 64, B1: 40, T1: 71, E2: 108, D2: 146 };
const SEASONS = ["2021", "2122", "2223", "2324", "2425", "2526", "2627"].filter((s) => s !== "2021");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");

interface Variant {
  fit?: FitOptions;
  opts?: ModelOptions;
  needsXg?: boolean;
  needsMkt?: boolean;
}
export const VARIANTS: Record<string, Variant> = {
  base: {},
  hl90: { fit: { halfLifeDays: 90 } },
  hl365: { fit: { halfLifeDays: 365 } },
  hl720: { fit: { halfLifeDays: 720 } },
  shot0: { fit: { shotWeight: 0 } },
  shot75: { fit: { shotWeight: 0.75 } },
  reg005: { fit: { regularisation: 0.005 } },
  reg02: { fit: { regularisation: 0.02 } },
  st11: { opts: { strengthStretch: 1.1 } },
  ts10: { opts: { totalsShrink: 1.0 } },
  ts60: { opts: { totalsShrink: 0.6 } },
  x_b: { fit: { shotWeight: 0.25, xgWeight: 0.5 }, needsXg: true },
  x_c: { fit: { shotWeight: 0, xgWeight: 0.5 }, needsXg: true },
  x_d: { fit: { shotWeight: 0.33, xgWeight: 0.33 }, needsXg: true },
  x_e: { fit: { shotWeight: 0, xgWeight: 0.75 }, needsXg: true },
  x_f: { fit: { shotWeight: 0, xgWeight: 1 }, needsXg: true },
  // Fitted partly to the goals the market's closing prices implied for past games (no price of the game being predicted is used).
  m25: { fit: { shotWeight: 0.5, mktWeight: 0.25 }, needsMkt: true },
  m50: { fit: { shotWeight: 0.25, mktWeight: 0.5 }, needsMkt: true },
  m50g: { fit: { shotWeight: 0, mktWeight: 0.5 }, needsMkt: true },
  m75: { fit: { shotWeight: 0, mktWeight: 0.75 }, needsMkt: true },
  m100: { fit: { shotWeight: 0, mktWeight: 1 }, needsMkt: true },
  m75_st11: { fit: { shotWeight: 0, mktWeight: 0.75 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl365: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 365 }, needsMkt: true },
  m75_hl90: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 90 }, needsMkt: true },
  m75_hl60: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 60 }, needsMkt: true },
  m75_hl120: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 120 }, needsMkt: true },
  m100_hl90: { fit: { shotWeight: 0, mktWeight: 1, halfLifeDays: 90 }, needsMkt: true },
  m100_hl60: { fit: { shotWeight: 0, mktWeight: 1, halfLifeDays: 60 }, needsMkt: true },
  m50_hl90: { fit: { shotWeight: 0.25, mktWeight: 0.5, halfLifeDays: 90 }, needsMkt: true },
  m50_hl60: { fit: { shotWeight: 0.25, mktWeight: 0.5, halfLifeDays: 60 }, needsMkt: true },
  m75_hl90_st11: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 90 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl90_st12: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 90 }, opts: { strengthStretch: 1.2 }, needsMkt: true },
  m100_hl90_st11: { fit: { shotWeight: 0, mktWeight: 1, halfLifeDays: 90 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl90_reg005: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 90, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl90_reg02: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 90, regularisation: 0.02 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl120_st11: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 120 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl120_st12: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 120 }, opts: { strengthStretch: 1.2 }, needsMkt: true },
  m75_hl120_reg005_st11: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl150_reg005_st11: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 150, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl180_reg005_st11: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 180, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m100_hl120_reg005_st11: { fit: { shotWeight: 0, mktWeight: 1, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m60s20_hl120_reg005_st11: { fit: { shotWeight: 0.2, mktWeight: 0.6, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true },
  m75_hl120_reg003_st13: { fit: { shotWeight: 0, mktWeight: 0.75, halfLifeDays: 120, regularisation: 0.003 }, opts: { strengthStretch: 1.3 }, needsMkt: true },
  mx_c: { fit: { shotWeight: 0, xgWeight: 0.3, mktWeight: 0.5, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true, needsXg: true },
  mx_d: { fit: { shotWeight: 0.1, xgWeight: 0.3, mktWeight: 0.5, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsMkt: true, needsXg: true },
  x_c_t: { fit: { shotWeight: 0, xgWeight: 0.5, halfLifeDays: 120, regularisation: 0.005 }, opts: { strengthStretch: 1.1 }, needsXg: true },
  mx_a: { fit: { shotWeight: 0, xgWeight: 0.25, mktWeight: 0.5 }, needsMkt: true, needsXg: true },
  mx_b: { fit: { shotWeight: 0, xgWeight: 0.4, mktWeight: 0.6 }, needsMkt: true, needsXg: true },
  x_c365: { fit: { shotWeight: 0, xgWeight: 0.5, halfLifeDays: 365 }, needsXg: true },
};

async function main() {
  const divCode = arg("div");
  const d = DIVS.find((x) => x.div === divCode);
  if (!d) throw new Error(`unknown --div ${divCode}`);
  const from = Date.parse(arg("from") ?? "2022-08-01");
  const to = Date.parse(clampEnd("2026-10-31", process.argv.includes("--final"))) + DAY;
  const rows: Row[] = [];
  for (const s of SEASONS) {
    try { rows.push(...parse(await csv(s, d.div), d.div)); } catch { /* season not published */ }
  }
  rows.sort((a, b) => a.date - b.date);
  const league = { code: d.code, label: d.label };

  // xG, where this division has it.
  const withXg = new Map<Row, [number, number]>();
  const xgFiles = (arg("xg") ?? "").split(",").filter(Boolean);
  if (xgFiles.length && FOTMOB[d.div]) {
    const all = xgFiles.flatMap((f) => (fs.existsSync(f) ? loadXgRows(f) : []));
    const m = makeXgMatcher(all, FOTMOB[d.div]);
    for (const r of rows) {
      const x = m(r.date, r.home, r.away, r.homeGoals, r.awayGoals);
      if (x) withXg.set(r, [x[0], x[1]]);
    }
    process.stderr.write(`${d.div}: xG on ${withXg.size} of ${rows.length} rows\n`);
  }
  const hasXg = withXg.size > rows.length * 0.2;
  // Market-implied goals for each past game from its closing prices, solved once and cached.
  const mktFile = path.join(path.dirname(arg("out") ?? "/tmp/lab/x.json"), "..", `mkt-${d.div}.json`);
  const mktCache: Record<string, [number, number]> = fs.existsSync(mktFile) ? JSON.parse(fs.readFileSync(mktFile, "utf8")) : {};
  const mktOf = (r: Row): [number, number] | undefined => {
    if (!r.close || !r.closeOu) return undefined;
    const k = `${r.date}|${r.home}|${r.away}`;
    if (mktCache[k]) return mktCache[k];
    const [pH, , pA] = fair3(r.close);
    const rates = impliedRates(pH, pA, fairOu(r.closeOu), -0.07, [1.45, 1.15]);
    mktCache[k] = rates;
    return rates;
  };
  const wantMkt = !arg("variants") || arg("variants")!.split(",").some((v) => VARIANTS[v]?.needsMkt);
  const rr = (r: Row) => {
    const x = withXg.get(r);
    const base = x ? { ...toResultRow(r), homeXg: x[0], awayXg: x[1] } : toResultRow(r);
    const m = wantMkt ? mktOf(r) : undefined;
    return m ? { ...base, homeMkt: m[0], awayMkt: m[1] } : base;
  };
  const only = arg("variants")?.split(",");
  const names = Object.keys(VARIANTS).filter((n) => (!VARIANTS[n].needsXg || hasXg) && (!VARIANTS[n].needsMkt || wantMkt) && (!only || only.includes(n)));

  const fits = new Map<string, ReturnType<typeof fitLeague>>();
  const out: unknown[] = [];
  let i = 0;
  let lastDay = -1;
  for (const row of rows.filter((r) => r.date >= from && r.date < to)) {
    const day = Math.floor(row.date / DAY) * DAY;
    while (i < rows.length && rows[i].date < day) i++;
    const prior = rows.slice(Math.max(0, i - 1200), i).map(rr);
    if (day !== lastDay) {
      fits.clear();
      lastDay = day;
    }
    const rec: Record<string, [number, number, number]> = {};
    let publishable = true;
    for (const n of names) {
      const v = VARIANTS[n];
      const key = JSON.stringify(v.fit ?? {});
      let fit = fits.get(key);
      if (!fit) fits.set(key, (fit = fitLeague(prior, v.fit)));
      const p = buildPrediction(toMatch(row, league), prior, [], { ...v.opts, prefit: fit });
      if (!p.sufficiency.publishable) { publishable = false; break; }
      rec[n] = [p.markets.expectedGoals.home, p.markets.expectedGoals.away, p.model.rho];
    }
    if (!publishable) continue;
    out.push({
      div: d.div,
      date: row.date,
      hg: row.homeGoals,
      ag: row.awayGoals,
      ht: row.htHome !== undefined && row.htAway !== undefined ? [row.htHome, row.htAway] : undefined,
      close: row.close, closeOu: row.closeOu, closeAh: row.closeAh,
      open: row.open, openOu: row.openOu, openAh: row.openAh,
      hasXg: withXg.has(row),
      v: rec,
    });
  }
  fs.writeFileSync(arg("out") ?? `/tmp/lab-${d.div}.json`, JSON.stringify(out));
  if (wantMkt) fs.writeFileSync(mktFile, JSON.stringify(mktCache));
  process.stderr.write(`${d.div}: ${out.length} fixtures, variants ${names.join(",")}\n`);
}

if (process.argv[1]?.endsWith("improve-lab.ts")) void main();
