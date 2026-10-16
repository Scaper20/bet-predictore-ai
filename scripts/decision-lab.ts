/**
 * Research only: how the shipped model's picks behave once they are chosen
 * and combined. Nothing here changes the model or what the site publishes.
 *
 * Walk-forward over the last N days (default 365) on every football-data.co.uk
 * division in the catalogue: each fixture is predicted from a fit on results
 * strictly before its matchday, the way league-lab.ts does it. Then:
 *
 *   1. calibration   every headline-eligible selection (1X2, double chance,
 *                    over/under 1.5, 2.5, 3.5), stated chance against how often
 *                    it landed, by market and by probability band;
 *   2. under/over    the model's over/under 2.5 chance against the closing
 *                    market's (de-vigged), and who was right when they disagree;
 *   3. digest        the WhatsApp digest's rule (digestPick) replayed;
 *   4. code hub      the day's hub rebuilt from every fixture of the day with
 *                    the production builder, plus variants that change how many
 *                    games a code uses and which markets it may use.
 *
 * Codes are graded at the model's fair odds: the source has no SportyBet
 * prices, and at fair odds a calibrated combo lands about 1 in its odds
 * whatever its length, so the hub numbers isolate calibration and selection.
 *
 *   npx tsx scripts/decision-lab.ts
 *   npx tsx scripts/decision-lab.ts --days=180 --only=E0,SP1
 */

import { buildPrediction, headlineEligible, type Prediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import { deVig } from "../src/lib/model/backtest";
import { candidatesFor, forge, type ForgeMarket, type ForgeRisk, type PoolEntry } from "../src/lib/forge";
import { bookablePool, daySeed, HUB_TIERS } from "../src/lib/code-hub";
import { digestPick } from "../src/lib/whatsapp-digest";
import { csv, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const SEASONS = ["2122", "2223", "2324", "2425", "2526", "2627"];
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const DIVS: { div: string; code: string; label: string }[] = [
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

interface Graded {
  day: number;
  div: string;
  row: Row;
  p: Prediction;
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

function walk(d: (typeof DIVS)[number], rows: Row[], days: number): Graded[] {
  const end = Date.now();
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
    out.push({ day, div: d.div, row, p });
  }
  return out;
}

const won = (market: string, r: Row) => evaluatePick(market, r.homeGoals, r.awayGoals);

/* ------------------------------------------------------------------ tally */

class Tally {
  n = 0;
  w = 0;
  stated = 0;
  add(win: boolean, prob: number) {
    this.n++;
    if (win) this.w++;
    this.stated += prob;
  }
  line(label: string, width = 34) {
    if (!this.n) return `${label.padEnd(width)}      —`;
    const hit = (100 * this.w) / this.n;
    const st = (100 * this.stated) / this.n;
    const gap = hit - st;
    return `${label.padEnd(width)} ${String(this.n).padStart(6)}  landed ${hit.toFixed(1).padStart(5)}%  stated ${st.toFixed(1).padStart(5)}%  gap ${(gap >= 0 ? "+" : "") + gap.toFixed(1)}`;
  }
}

function family(market: string): string {
  const [f, side, line] = market.split(":");
  if (f === "ou") return `${side} ${line}`;
  if (f === "dc") return `dc ${side}`;
  if (f === "1x2") return `1x2 ${side}`;
  return f;
}

function band(p: number): string {
  const lo = Math.floor(p * 10) / 10;
  return `${Math.round(lo * 100)}-${Math.round(lo * 100) + 10}%`;
}

/* --------------------------------------------------------------- analyses */

function calibration(all: Graded[]) {
  const byFam = new Map<string, Tally>();
  const byBand = new Map<string, Tally>();
  const byFamBand = new Map<string, Tally>();
  const top = new Map<string, Tally>();
  for (const g of all) {
    for (const pk of g.p.picks) {
      if (!headlineEligible(pk) && !pk.market.startsWith("ou:")) continue;
      const fam = family(pk.market);
      if (!/^(1x2|dc|over|under)/.test(fam)) continue;
      if (pk.probability < 0.5) continue;
      const r = won(pk.market, g.row);
      if (!r || r === "push") continue;
      const win = r === "win";
      const get = (m: Map<string, Tally>, k: string) => m.get(k) ?? m.set(k, new Tally()).get(k)!;
      get(byFam, fam).add(win, pk.probability);
      get(byBand, band(pk.probability)).add(win, pk.probability);
      if (fam.startsWith("under") || fam.startsWith("over")) get(byFamBand, `${fam} @ ${band(pk.probability)}`).add(win, pk.probability);
    }
    if (g.p.topPick) {
      const r = won(g.p.topPick.market, g.row);
      if (r && r !== "push") {
        const k = family(g.p.topPick.market);
        (top.get(k) ?? top.set(k, new Tally()).get(k)!).add(r === "win", g.p.topPick.probability);
      }
    }
  }
  console.log("\n1. CALIBRATION: every selection the model rates 50% or more");
  console.log("\n  by market");
  for (const [k, t] of [...byFam].sort()) console.log("  " + t.line(k));
  console.log("\n  by stated chance (all markets)");
  for (const [k, t] of [...byBand].sort()) console.log("  " + t.line(k));
  console.log("\n  goals lines by stated chance");
  for (const [k, t] of [...byFamBand].sort()) if (t.n >= 40) console.log("  " + t.line(k));
  console.log("\n  the published pick (topPick) by market");
  for (const [k, t] of [...top].sort()) console.log("  " + t.line(k));
}

function overUnder(all: Graded[]) {
  let n = 0, model = 0, market = 0, actual = 0;
  const agree = { modelUnder: new Tally(), marketUnder: new Tally() };
  const disagree: Record<string, { n: number; modelRight: number }> = {
    "model leans Under by 5+ pts": { n: 0, modelRight: 0 },
    "model leans Over by 5+ pts": { n: 0, modelRight: 0 },
  };
  for (const g of all) {
    const c = g.row.closeOu;
    if (!c) continue;
    const [mOver, mUnder] = deVig([c.over, c.under]);
    const under = g.p.picks.find((x) => x.market === "ou:under:2.5")?.probability;
    if (under === undefined) continue;
    const isUnder = g.row.homeGoals + g.row.awayGoals < 2.5;
    n++;
    model += under;
    market += mUnder;
    if (isUnder) actual++;
    if (under >= 0.5) agree.modelUnder.add(isUnder, under);
    if (mUnder >= 0.5) agree.marketUnder.add(isUnder, mUnder);
    const diff = under - mUnder;
    if (diff >= 0.05) {
      disagree["model leans Under by 5+ pts"].n++;
      if (isUnder) disagree["model leans Under by 5+ pts"].modelRight++;
    } else if (diff <= -0.05) {
      disagree["model leans Over by 5+ pts"].n++;
      if (!isUnder) disagree["model leans Over by 5+ pts"].modelRight++;
    }
    void mOver;
  }
  console.log("\n2. UNDER/OVER 2.5 AGAINST THE CLOSING MARKET");
  console.log(`  fixtures ${n}: average Under chance  model ${(100 * model / n).toFixed(1)}%  market ${(100 * market / n).toFixed(1)}%  actual ${(100 * actual / n).toFixed(1)}%`);
  console.log("  " + agree.modelUnder.line("model says Under 2.5 (>=50%)"));
  console.log("  " + agree.marketUnder.line("market says Under 2.5 (>=50%)"));
  for (const [k, v] of Object.entries(disagree)) {
    console.log(`  ${k.padEnd(34)} ${String(v.n).padStart(6)}  model right ${v.n ? ((100 * v.modelRight) / v.n).toFixed(1) : "—"}%`);
  }
}

function digest(all: Graded[]) {
  const byFam = new Map<string, Tally>();
  const total = new Tally();
  for (const g of all) {
    const pk = digestPick(g.p);
    if (!pk) continue;
    const r = won(pk.market, g.row);
    if (!r || r === "push") continue;
    const k = family(pk.market);
    (byFam.get(k) ?? byFam.set(k, new Tally()).get(k)!).add(r === "win", pk.probability);
    total.add(r === "win", pk.probability);
    // Was this the fixture's own top pick, or a fallback past the 1.40 floor?
  }
  let fallback = 0, same = 0;
  for (const g of all) {
    const pk = digestPick(g.p);
    if (!pk || !g.p.topPick) continue;
    if (pk.market === g.p.topPick.market) same++;
    else fallback++;
  }
  console.log("\n3. WHATSAPP DIGEST RULE (one pick per fixture, fair odds 1.40 or longer)");
  console.log("  " + total.line("all"));
  for (const [k, t] of [...byFam].sort()) console.log("  " + t.line(k));
  console.log(`  digest pick is the fixture's own top pick: ${same}; a fallback past the price floor: ${fallback}`);
}

/* --------------------------------------------------------------- code hub */

interface Variant {
  name: string;
  markets: ForgeMarket[];
  tiers: { target: number; games: number; risk: ForgeRisk }[];
  /** Pick legs by chance first, then stop at the target (the digest's way). */
  chanceFirst?: boolean;
}

const BASE_MARKETS: ForgeMarket[] = ["result", "double_chance", "goals", "btts"];

const VARIANTS: Variant[] = [
  { name: "current hub", markets: BASE_MARKETS, tiers: HUB_TIERS.map((t) => ({ target: t.target, games: t.games, risk: t.risk })) },
  {
    name: "more, shorter legs",
    markets: BASE_MARKETS,
    tiers: [
      { target: 2, games: 3, risk: "safe" },
      { target: 3, games: 4, risk: "safe" },
      { target: 5, games: 6, risk: "safe" },
      { target: 10, games: 8, risk: "balanced" },
      { target: 20, games: 10, risk: "balanced" },
    ],
  },
  {
    name: "fewer, longer legs",
    markets: BASE_MARKETS,
    tiers: [
      { target: 2, games: 1, risk: "balanced" },
      { target: 3, games: 2, risk: "balanced" },
      { target: 5, games: 3, risk: "balanced" },
      { target: 10, games: 3, risk: "risky" },
      { target: 20, games: 4, risk: "risky" },
    ],
  },
  { name: "results only (no goals/BTTS)", markets: ["result", "double_chance"], tiers: HUB_TIERS.map((t) => ({ target: t.target, games: t.games, risk: t.risk })) },
  {
    name: "results only, 1.5/2/3/5/10",
    markets: ["result", "double_chance"],
    tiers: [
      { target: 1.5, games: 1, risk: "safe" },
      { target: 2, games: 2, risk: "safe" },
      { target: 3, games: 3, risk: "safe" },
      { target: 5, games: 4, risk: "balanced" },
      { target: 10, games: 5, risk: "balanced" },
    ],
  },
  { name: "chance-first, all markets", markets: BASE_MARKETS, tiers: HUB_TIERS.map((t) => ({ target: t.target, games: 0, risk: t.risk })), chanceFirst: true },
  { name: "chance-first, results only", markets: ["result", "double_chance"], tiers: HUB_TIERS.map((t) => ({ target: t.target, games: 0, risk: t.risk })), chanceFirst: true },
];

/** Strongest legs first, one per game, until the combined fair price reaches the target. */
function chanceFirst(pool: PoolEntry[], target: number, avoid: Set<string>): (PoolEntry["candidates"][number] & { matchId: string })[] {
  const best = pool
    .map((e) => ({ e, c: [...e.candidates].filter((c) => c.fairOdds >= 1.12).sort((a, b) => b.probability - a.probability)[0] }))
    .filter((x) => x.c)
    .sort((a, b) => (avoid.has(a.e.prediction.match.id) ? 1 : 0) - (avoid.has(b.e.prediction.match.id) ? 1 : 0) || b.c.probability - a.c.probability);
  const legs: (PoolEntry["candidates"][number] & { matchId: string })[] = [];
  let odds = 1;
  for (const x of best) {
    if (odds >= target * 0.95) break;
    legs.push({ ...x.c, matchId: x.e.prediction.match.id });
    odds *= x.c.fairOdds;
  }
  return odds >= target * 0.95 ? legs : [];
}

function hub(all: Graded[]) {
  const byDay = new Map<number, Graded[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const days = [...byDay.keys()].sort((a, b) => a - b);

  console.log(`\n4. CODE HUB REPLAYED (${days.length} days with games, fair odds)`);
  for (const v of VARIANTS) {
    const stats = v.tiers.map(() => ({ built: 0, landed: 0, expected: 0, legs: 0, legProb: 0, legWins: 0, legN: 0 }));
    let anyLanded = 0, builtDays = 0;
    for (const day of days) {
      const games = byDay.get(day)!;
      const rowById = new Map(games.map((g) => [g.p.match.id, g.row]));
      const pool: PoolEntry[] = bookablePool(
        games.map((g) => ({ prediction: g.p, candidates: candidatesFor(g.p, { markets: v.markets, picksPerGame: 1, allowHandicap: false }) })),
      );
      if (pool.length < 2) continue;
      builtDays++;
      const used = new Set<string>();
      let dayLanded = false;
      v.tiers.forEach((t, ti) => {
        let legs: { market: string; probability: number; fairOdds: number; matchId: string }[];
        if (v.chanceFirst) {
          legs = chanceFirst(pool, t.target, used);
        } else {
          const res = forge(pool, { risk: t.risk, targetOdds: t.target, games: t.games, picksPerGame: 1, markets: v.markets, when: "today", leagues: "all", stake: 1000 }, {
            locked: [], removed: [], avoid: [...used], seed: daySeed(String(day)) + ti,
          });
          legs = res.legs.length >= t.games ? res.legs : [];
        }
        if (legs.length === 0) return;
        for (const l of legs) used.add(l.matchId);
        const s = stats[ti];
        s.built++;
        const prob = legs.reduce((a, l) => a * l.probability, 1);
        s.expected += prob;
        s.legs += legs.length;
        let all = true;
        for (const l of legs) {
          const r = won(l.market, rowById.get(l.matchId)!);
          const win = r === "win" || r === "push";
          s.legN++;
          s.legProb += l.probability;
          if (win) s.legWins++;
          else all = false;
        }
        if (all) {
          s.landed++;
          dayLanded = true;
        }
      });
      if (dayLanded) anyLanded++;
    }
    console.log(`\n  ${v.name}: at least one code landed on ${((100 * anyLanded) / Math.max(1, builtDays)).toFixed(0)}% of ${builtDays} days`);
    console.log("    target   built  landed  expected  avg legs  leg landed  leg stated");
    v.tiers.forEach((t, ti) => {
      const s = stats[ti];
      if (!s.built) return;
      console.log(
        `    ${String(t.target).padStart(5)}   ${String(s.built).padStart(5)}  ${((100 * s.landed) / s.built).toFixed(1).padStart(5)}%   ${((100 * s.expected) / s.built).toFixed(1).padStart(5)}%    ${(s.legs / s.built).toFixed(1).padStart(4)}      ${((100 * s.legWins) / s.legN).toFixed(1).padStart(5)}%     ${((100 * s.legProb) / s.legN).toFixed(1).padStart(5)}%`,
      );
    });
  }
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const only = arg("only")?.split(",");
  const all: Graded[] = [];
  for (const d of DIVS.filter((x) => !only || only.includes(x.div))) {
    process.stderr.write(`${d.div}… `);
    all.push(...walk(d, await load(d.div), days));
  }
  process.stderr.write(`\n${all.length} publishable fixtures\n`);
  calibration(all);
  overUnder(all);
  digest(all);
  hub(all);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
