/**
 * Forge slips replayed walk-forward (audit, Nov 2026).
 *
 * For every match day in the last 365 days (stopping at 31 Oct 2026, the
 * frozen holdout), the day's games become Forge's pool exactly as forge-feed.ts
 * builds it (candidatesFor, the board price on each single) with the closing
 * price standing in for SportyBet's. forgeSolve then builds a slip per style
 * and the slip is graded on the real scores.
 *
 *   npx tsx scripts/forge-lab.ts [--final]
 *
 * Stat markets (corners, shots) are not replayed: the source has no counts
 * for the pool the way the site has them.
 */
import { buildPrediction, type Prediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { candidatesFor, type ForgeSettings, type PoolEntry, type ForgeLeg } from "../src/lib/forge";
import { forgeSolve } from "../src/lib/forge-solve";
import { gradeMarket } from "../src/lib/slip-tracker";
import { twinsOf } from "../src/lib/odds/bookable";
import { isQuotable } from "../src/lib/odds/markets";
import { csv, parse, priceFor, toMatch, toResultRow, type Row } from "./lib/football-data-uk";
import { clampEnd } from "./lib/holdout";
import { DIVS } from "./audit-eval";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"];

interface G { day: number; row: Row; p: Prediction }

function closing(market: string, r: Row): number | undefined {
  for (const m of [market, ...twinsOf(market).map((t) => t.market)]) {
    const p = priceFor(m, r).price;
    if (p !== undefined && p > 1) return p;
  }
  return undefined;
}

/** The closing market's chance for a selection (margin removed), 1X2 / double chance / over-under 2.5 and their twins. */
function closingChance(market: string, r: Row): number | null {
  for (const m of [market, ...twinsOf(market).map((t) => t.market)]) {
    const p = priceFor(m, r).marketProbability;
    if (p !== undefined && p > 0) return p;
  }
  return null;
}

async function load(div: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const s of SEASONS) {
    try { rows.push(...parse(await csv(s, div), div)); } catch { /* not published */ }
  }
  return rows.sort((a, b) => a.date - b.date);
}

async function walk(): Promise<G[]> {
  const end = Date.parse(clampEnd(undefined, process.argv.includes("--final"))) + DAY;
  const out: G[] = [];
  for (const d of DIVS) {
    const rows = await load(d.div);
    const league = { code: d.code, label: d.label };
    const fits = new Map<number, ReturnType<typeof fitLeague>>();
    let i = 0;
    for (const row of rows.filter((r) => r.date >= end - 365 * DAY && r.date < end)) {
      const day = Math.floor(row.date / DAY) * DAY;
      while (i < rows.length && rows[i].date < day) i++;
      const prior = rows.slice(Math.max(0, i - TRAIN_CAP), i).map(toResultRow);
      let fit = fits.get(day);
      if (!fit) fits.set(day, (fit = fitLeague(prior)));
      const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit });
      if (p.sufficiency.publishable) out.push({ day, row, p });
    }
    process.stderr.write(`${d.div} `);
  }
  return out;
}

const STYLES: { name: string; target: number; games: number; risk: ForgeSettings["risk"] }[] = [
  { name: "Safe 2.5 x3", target: 2.5, games: 3, risk: "safe" },
  { name: "Balanced 5 x4", target: 5, games: 4, risk: "balanced" },
  { name: "Balanced 10 x5", target: 10, games: 5, risk: "balanced" },
  { name: "Risky 20 x5", target: 20, games: 5, risk: "risky" },
];
const MARKETS: ForgeSettings["markets"] = ["result", "double_chance", "goals", "btts"];

function settings(s: (typeof STYLES)[number], picksPerGame: 1 | 2): ForgeSettings {
  return { risk: s.risk, targetOdds: s.target, games: s.games, picksPerGame, markets: MARKETS, when: "today", days: null, leagues: [], stake: 1000 };
}

function grade(legs: ForgeLeg[], rows: Map<string, Row>): "win" | "lose" {
  for (const l of legs) {
    const r = rows.get(l.matchId)!;
    const x = gradeMarket(l.market, r.homeGoals, r.awayGoals);
    if (x === "lose" || x === null) return "lose";
  }
  return "win";
}

async function main() {
  const all = await walk();
  process.stderr.write(`\n${all.length} fixtures\n`);
  const byDay = new Map<number, G[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const rows = new Map(all.map((g) => [g.p.match.id, g.row]));
  const days = [...byDay.keys()].sort((a, b) => a - b);

  // The market check (forge-feed.ts keepOnBoard, LEG_MARKET_GAP 5pt) is on in production for games SportyBet lists:
  // a single the closing market rates 5pt+ below us is left out. "No check" is what a game off the board gets.
  const GAP = 0.05;
  const variants: [string, boolean][] = [["as production: market check 5pt", true], ["no market check (game not on the board)", false]];
  for (const ppg of [2, 1] as const) {
    console.log(`\n=== ${ppg} pick${ppg === 2 ? "s" : ""} per game, markets: result, two results, over goals, GG/NG; closing prices stand in for SportyBet's`);
    console.log("style           variant                                  slips  landed  expected  avg legs  shown odds  in band  loads at  return landed / expected");
    for (const st of STYLES) {
      for (const [vn, check] of variants) {
        let built = 0, landed = 0, expected = 0, legs = 0, shown = 0, inBand = 0, loads = 0, retL = 0, retE = 0;
        for (const day of days) {
          const pool: PoolEntry[] = byDay.get(day)!.map((g) => ({
            prediction: g.p,
            candidates: candidatesFor(g.p, { markets: MARKETS, picksPerGame: ppg, allowHandicap: true, statLines: "tested" })
              .filter((c) => c.market.startsWith("combo:") || isQuotable(c.market))
              .filter((c) => !check || c.market.startsWith("combo:") || (closingChance(c.market, g.row) ?? Infinity) > c.probability - GAP)
              .map((c) => ({ ...c, price: c.market.startsWith("combo:") ? null : closing(c.market, g.row) ?? null })),
          })).filter((e) => e.candidates.length > 0);
          if (pool.length < st.games) continue;
          const res = forgeSolve(pool, settings(st, ppg), { locked: [], removed: [], avoid: [], seed: 7 + day / DAY });
          if (res.legs.length < st.games) continue;
          built++;
          const p = res.legs.reduce((a, l) => a * l.probability, 1);
          const sh = res.legs.reduce((a, l) => a * (l.price ?? l.fairOdds), 1);
          const ld = res.legs.reduce((a, l) => a * (l.market.startsWith("combo:") ? l.fairOdds / 1.1 : l.price ?? l.fairOdds / 1.07), 1);
          legs += res.legs.length; expected += p; shown += sh; loads += ld;
          if (Math.abs(sh / st.target - 1) <= 0.05 || (st.target < 3 && Math.abs(sh - st.target) <= 0.1)) inBand++;
          const won = grade(res.legs, rows) === "win";
          if (won) landed++;
          retL += won ? ld : 0; retE += p * ld;
        }
        if (!built) continue;
        console.log(`${st.name.padEnd(15)} ${vn.padEnd(40)} ${String(built).padStart(5)}  ${(100 * landed / built).toFixed(1).padStart(5)}%  ${(100 * expected / built).toFixed(1).padStart(6)}%   ${(legs / built).toFixed(1).padStart(5)}     ${(shown / built).toFixed(2).padStart(6)}     ${(100 * inBand / built).toFixed(0).padStart(3)}%    ${(loads / built).toFixed(2).padStart(6)}    ${(retL / built).toFixed(2)} / ${(retE / built).toFixed(2)}`);
      }
    }
  }
}

if (process.argv[1]?.endsWith("forge-lab.ts")) void main();
