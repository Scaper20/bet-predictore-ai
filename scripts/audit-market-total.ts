/**
 * Market-informed totals, walk-forward (audit, Nov 2026).
 *
 * The model's two goal rates are scaled together until its over 2.5 equals the
 * closing market's (margin removed), keeping the model's split between the
 * sides (model/market-total.ts totalScale). Everything else is then read off
 * the scaled grid. The 2.5 line is set from the price, so it is not a test;
 * lines 1.5 and 3.5, both-teams-to-score and 1X2 are, and so is how the
 * model's own total compares. `weight` 1 takes the market's total fully, 0.5
 * halfway (in log scale).
 *
 * Closing prices stand in for SportyBet's at publish, which are less sharp, so
 * the gain here is an upper bound on what a publish-time read can give.
 * Stops at 31 Oct 2026 (frozen holdout).
 *
 *   npx tsx scripts/audit-market-total.ts
 */
import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { deVig } from "../src/lib/model/backtest";
import { deriveMarkets, scoreMatrix } from "../src/lib/model/poisson";
import { totalScale } from "../src/lib/model/market-total";
import { csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { TUNING_END } from "./lib/holdout";
import { DIVS } from "./audit-eval";

const DAY = 86_400_000;
const T = (s: string) => Date.parse(s);
const END = T(TUNING_END) + DAY;
const WINS: [string, number, number][] = [
  ["A 2023-08 to 2026-06", T("2023-08-01"), T("2026-07-01")],
  ["held out 2025-26", T("2025-07-01"), T("2026-07-01")],
  ["B Sep-Oct 2026", T("2026-09-01"), T("2026-11-01")],
];
const WEIGHTS = [0, 0.5, 1];
const SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"];
const ll = (p: number) => -Math.log(Math.max(1e-9, p));

interface R { date: number; hg: number; ag: number; w: Record<string, { o15: number; o25: number; o35: number; btts: number; h: number; d: number; a: number; total: number }>; mkt: [number, number, number] | null; mktO25: number }

async function main() {
  const out: R[] = [];
  for (const d of DIVS) {
    const rows: Row[] = [];
    for (const s of SEASONS) { try { rows.push(...parse(await csv(s, d.div), d.div)); } catch { /* not published */ } }
    rows.sort((a, b) => a.date - b.date);
    const league = { code: d.code, label: d.label };
    const fits = new Map<number, ReturnType<typeof fitLeague>>();
    let i = 0;
    for (const row of rows.filter((r) => r.date >= WINS[0][1] && r.date < END)) {
      if (!row.closeOu) continue;
      const day = Math.floor(row.date / DAY) * DAY;
      while (i < rows.length && rows[i].date < day) i++;
      const prior = rows.slice(Math.max(0, i - 1200), i).map(toResultRow);
      let fit = fits.get(day);
      if (!fit) fits.set(day, (fit = fitLeague(prior)));
      const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit });
      if (!p.sufficiency.publishable) continue;
      const { home: lam, away: mu } = p.markets.expectedGoals;
      const rho = p.model.rho;
      const [overFair] = deVig([row.closeOu.over, row.closeOu.under]);
      const s = totalScale(lam, mu, rho, overFair);
      const w: R["w"] = {};
      for (const wt of WEIGHTS) {
        const k = s === null ? 1 : Math.exp(wt * Math.log(s));
        const g = scoreMatrix(lam * k, mu * k, rho);
        const m = deriveMarkets(g, lam * k, mu * k);
        w[String(wt)] = { o15: m.over["1.5"], o25: m.over["2.5"], o35: m.over["3.5"], btts: m.bttsYes, h: m.home, d: m.draw, a: m.away, total: (lam + mu) * k };
      }
      out.push({ date: row.date, hg: row.homeGoals, ag: row.awayGoals, w, mkt: row.close ? (deVig([row.close.home, row.close.draw, row.close.away]) as [number, number, number]) : null, mktO25: overFair });
    }
    process.stderr.write(`${d.div} `);
  }
  process.stderr.write("\n");
  for (const [name, a, b] of WINS) {
    const rs = out.filter((r) => r.date >= a && r.date < b);
    console.log(`\n${name}: ${rs.length} fixtures with a closing over/under price`);
    console.log("market weight   OU1.5 LL  OU2.5 LL (set from price)  OU3.5 LL  BTTS LL   1X2 LL   mean total goals vs actual");
    for (const wt of WEIGHTS) {
      const k = String(wt);
      const mean = (f: (r: R) => number) => rs.reduce((x, r) => x + f(r), 0) / rs.length;
      const res = (r: R) => (r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2);
      console.log(
        `   ${String(wt).padEnd(10)} ${mean((r) => ll(r.hg + r.ag > 1.5 ? r.w[k].o15 : 1 - r.w[k].o15)).toFixed(4)}   ${mean((r) => ll(r.hg + r.ag > 2.5 ? r.w[k].o25 : 1 - r.w[k].o25)).toFixed(4)}                  ${mean((r) => ll(r.hg + r.ag > 3.5 ? r.w[k].o35 : 1 - r.w[k].o35)).toFixed(4)}   ${mean((r) => ll(r.hg > 0 && r.ag > 0 ? r.w[k].btts : 1 - r.w[k].btts)).toFixed(4)}  ${mean((r) => ll([r.w[k].h, r.w[k].d, r.w[k].a][res(r)])).toFixed(4)}   ${mean((r) => r.w[k].total).toFixed(3)} vs ${mean((r) => r.hg + r.ag).toFixed(3)}`,
      );
    }
    const mk = rs.filter((r) => r.mkt);
    console.log(`   market 1X2 LL ${(mk.reduce((x, r) => x + ll(r.mkt![r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2]), 0) / mk.length).toFixed(4)}   market OU2.5 LL ${(rs.reduce((x, r) => x + ll(r.hg + r.ag > 2.5 ? r.mktO25 : 1 - r.mktO25), 0) / rs.length).toFixed(4)}`);
  }
}

if (process.argv[1]?.endsWith("audit-market-total.ts")) void main();
