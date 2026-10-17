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
 *   4. code hub      the day's hub rebuilt with the production builder (the
 *                    four-day codes from that day and the next three), against
 *                    the first hub and variants without some markets;
 *   5. headline      the published pick with unders paused;
 *   6. digest        variants of the digest's pick rule and combo lengths.
 *
 * --round=1 also prints sections 1-3 (calibration, over/under, the old digest).
 *
 * Codes are graded at the model's fair odds: the source has no SportyBet
 * prices, and at fair odds a calibrated combo lands about 1 in its odds
 * whatever its length, so the hub numbers isolate calibration and selection.
 *
 *   npx tsx scripts/decision-lab.ts
 *   npx tsx scripts/decision-lab.ts --days=180 --only=E0,SP1
 */

import { buildPrediction, headlineEligible, type Pick, type Prediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { resultCalibrationFor } from "../src/lib/model/result-calibration";
import { evaluatePick } from "../src/lib/settlement";
import { deVig } from "../src/lib/model/backtest";
import { candidatesFor, forge, type ForgeRisk, type PoolEntry } from "../src/lib/forge";
import { buildHub, daySeed, hubMarketAllowed, hubTier, HUB_FORGE_MARKETS, HUB_TIERS, withoutHandicap, type HubBuildOptions } from "../src/lib/code-hub";
import { isQuotable } from "../src/lib/odds/markets";
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
    // --cal=1: the straight-win correction production applies to these divisions.
    const p = buildPrediction(toMatch(row, league), prior, [], { prefit: fit, ...(arg("cal") === "1" ? { resultCalibration: resultCalibrationFor(d.code) } : {}) });
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

/* ------------------------------------------------------- pick selection */

const isUnder = (m: string) => m.startsWith("ou:under");
const isHalfAh = (m: string) => m.startsWith("ah:") && Math.abs((Number(m.split(":")[2]) * 2) % 2) === 1;

interface PickRule {
  noUnder?: boolean;
  /** Half-goal Asian handicap lines (60-80%) when nothing else qualifies. */
  ah?: boolean;
  floor?: number;
  minProb?: number;
}

/** The headline order (prediction.picks) with the rule's exclusions, handicap as a fallback. */
function choose(p: Prediction, rule: PickRule, bar?: (m: string) => boolean): Pick | null {
  const ok = (x: Pick) =>
    x.probability >= (rule.minProb ?? 0.4) &&
    x.fairOdds >= (rule.floor ?? 1) &&
    !(rule.noUnder && isUnder(x.market)) &&
    !bar?.(x.market);
  const main = p.picks.find((x) => headlineEligible(x) && ok(x));
  if (main) return main;
  if (!rule.ah) return null;
  return p.picks.filter((x) => isHalfAh(x.market) && x.probability >= 0.6 && x.probability <= 0.8 && ok(x)).sort((a, b) => b.probability - a.probability)[0] ?? null;
}

function grade(pk: Pick, r: Row): boolean | null {
  const g = won(pk.market, r);
  if (!g || g === "push") return null;
  return g === "win";
}

function headline(all: Graded[]) {
  // headlineEligible skips unders since 16 Oct 2026 (model/paused.ts); before
  // the pause this replay gave 75.9% landed (74.0% stated, average 1.36) with
  // unders, against the 75.4% (73.0%, 1.38) of the paused rule below.
  console.log("\n5. PUBLISHED PICK WITH UNDERS PAUSED");
  const rules: [string, PickRule][] = [
    ["unders paused (live rule)", { noUnder: true }],
    ["unders paused, handicap fallback", { noUnder: true, ah: true }],
  ];
  for (const [name, rule] of rules) {
    const t = new Tally();
    const fam = new Map<string, Tally>();
    let none = 0, price = 0;
    for (const g of all) {
      const pk = choose(g.p, rule);
      if (!pk) { none++; continue; }
      const w = grade(pk, g.row);
      if (w === null) continue;
      t.add(w, pk.probability);
      price += pk.fairOdds;
      const k = family(pk.market);
      (fam.get(k) ?? fam.set(k, new Tally()).get(k)!).add(w, pk.probability);
    }
    console.log("  " + t.line(name) + `  avg price ${(price / Math.max(1, t.n)).toFixed(2)}  no pick ${none}`);
    if (rule.noUnder) for (const [k, v] of [...fam].sort()) if (v.n >= 30) console.log("      " + v.line(k, 30));
  }
  // Handicap lines on their own, for reference.
  const ah = new Map<string, Tally>();
  for (const g of all) for (const pk of g.p.picks) {
    if (!isHalfAh(pk.market) || pk.probability < 0.5 || pk.probability > 0.85) continue;
    const w = grade(pk, g.row);
    if (w === null) continue;
    const [, side, line] = pk.market.split(":");
    const k = `ah ${side} ${Number(line) > 0 ? "+" : ""}${line} @ ${band(pk.probability)}`;
    (ah.get(k) ?? ah.set(k, new Tally()).get(k)!).add(w, pk.probability);
  }
  console.log("\n  half-goal handicap lines rated 50-85% (every fixture)");
  for (const [k, v] of [...ah].sort()) if (v.n >= 80) console.log("  " + v.line(k));
}

function digest2(all: Graded[]) {
  console.log("\n6. WHATSAPP DIGEST VARIANTS (one pick per fixture; combos from each day's top 8)");
  const byDay = new Map<number, Graded[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const rules: [string, PickRule][] = [
    ["1.40 floor, no unders, handicap fallback", { floor: 1.4, noUnder: true, ah: true }],
    ["1.30 floor, no unders, handicap fallback", { floor: 1.3, noUnder: true, ah: true }],
    ["best read, no floor, no unders, handicap fallback", { noUnder: true, ah: true }],
  ];
  const comboSets: [string, number[], number][] = [
    ["combos 2 / 5 / 10 (before)", [2, 5, 10], 12],
    ["combos 2 / 3 / 5, max 6 legs (live)", [2, 3, 5], 6],
  ];
  for (const [name, rule] of rules) {
    const t = new Tally();
    let price = 0;
    const perDay: { prob: number; conf: number; won: boolean }[][] = [];
    for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
      const chosen: { prob: number; conf: number; won: boolean }[] = [];
      for (const g of byDay.get(day)!) {
        const pk = choose(g.p, rule);
        if (!pk) continue;
        const w = grade(pk, g.row);
        if (w === null) continue;
        chosen.push({ prob: pk.probability, conf: pk.confidence, won: w });
      }
      chosen.sort((a, b) => b.conf - a.conf);
      const top = chosen.slice(0, 8);
      for (const c of top) { t.add(c.won, c.prob); price += 1 / c.prob; }
      perDay.push(top);
    }
    console.log(`\n  ${name}`);
    console.log("    " + t.line("singles (top 8 a day)", 30) + `  avg fair price ${(price / Math.max(1, t.n)).toFixed(2)}`);
    for (const [cname, targets, maxLegs] of comboSets) {
      const res = targets.map(() => ({ built: 0, landed: 0, legs: 0, expected: 0 }));
      for (const day of perDay) {
        let lastKey = "";
        targets.forEach((target, ti) => {
          let legs: typeof day = [];
          for (let n = 2; n <= Math.min(maxLegs, day.length); n++) {
            const sub = day.slice(0, n);
            legs = sub;
            if (1 / sub.reduce((a, c) => a * c.prob, 1) >= target) break;
          }
          if (legs.length < 2 || 1 / legs.reduce((a, c) => a * c.prob, 1) < target * 0.9) return;
          const key = String(legs.length);
          if (key === lastKey) return;
          lastKey = key;
          const r = res[ti];
          r.built++;
          r.legs += legs.length;
          r.expected += legs.reduce((a, c) => a * c.prob, 1);
          if (legs.every((c) => c.won)) r.landed++;
        });
      }
      console.log(`    ${cname}: ` + targets.map((tg, i) => {
        const r = res[i];
        return r.built ? `${tg}-odds landed ${((100 * r.landed) / r.built).toFixed(0)}% of ${r.built} (exp ${((100 * r.expected) / r.built).toFixed(0)}%, ${(r.legs / r.built).toFixed(1)} legs)` : `${tg}-odds —`;
      }).join("  |  "));
    }
  }
}

/* --------------------------------------------------------------- code hub */

interface HubVariant {
  name: string;
  allow: (market: string) => boolean;
  options?: HubBuildOptions;
}

const HUB_VARIANTS: HubVariant[] = [
  { name: "v2 fixed counts: result, double chance, over 1.5", allow: withoutHandicap, options: { strategy: "count" } },
  { name: "v2 fixed counts plus half-goal handicap", allow: hubMarketAllowed, options: { strategy: "count" } },
  { name: "v2 result and double chance only", allow: (m) => m.startsWith("1x2") || m.startsWith("dc"), options: { strategy: "count" } },
  { name: "best legs first, no game count (legs 1.15+)", allow: withoutHandicap, options: { strategy: "best", minLegOdds: 1.15 } },
  { name: "best legs first, no game count (legs 1.25+)", allow: withoutHandicap, options: { strategy: "best", minLegOdds: 1.25 } },
  { name: "flex game count, no handicap", allow: withoutHandicap, options: { strategy: "flex" } },
  { name: "result, double chance, half-goal handicap", allow: resultDcHandicap, options: { strategy: "count" } },
  { name: "flex: result, double chance, half-goal handicap", allow: resultDcHandicap, options: { strategy: "flex" } },
  { name: "as shipped: flex to 5 odds, counts above; result, double chance, over 1.5, half-goal handicap", allow: hubMarketAllowed },
];

function resultDcHandicap(market: string): boolean {
  const [family, , line] = market.split(":");
  if (family === "1x2" || family === "dc") return true;
  return family === "ah" && Math.abs((Number(line) * 2) % 2) === 1;
}

/** The first hub (16 Oct), for comparison: four markets, no floor, five tiers. */
const V1_TIERS: { target: number; games: number; risk: ForgeRisk }[] = [
  { target: 2, games: 2, risk: "safe" },
  { target: 3, games: 3, risk: "safe" },
  { target: 5, games: 4, risk: "balanced" },
  { target: 10, games: 5, risk: "balanced" },
  { target: 20, games: 6, risk: "risky" },
];

function gradeLegs(legs: { market: string; matchId: string; probability: number }[], rows: Map<string, Row>) {
  let all = true, wins = 0;
  for (const l of legs) {
    const r = won(l.market, rows.get(l.matchId)!);
    if (r === "win" || r === "push") wins++;
    else all = false;
  }
  return { all, wins };
}

function hub(all: Graded[]): { day: number; tier: string; odds: number; chance: number; landed: boolean; legs: string[]; misses: number }[] {
  const byDay = new Map<number, Graded[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const rows = new Map(all.map((g) => [g.p.match.id, g.row]));
  console.log(`\n4. CODE HUB REPLAYED (${days.length} days with games, fair odds)`);

  // v1 for reference.
  {
    const s = V1_TIERS.map(() => ({ built: 0, landed: 0, expected: 0 }));
    let anyDays = 0, built = 0;
    for (const day of days) {
      const pool: PoolEntry[] = byDay.get(day)!.map((g) => ({
        prediction: g.p,
        candidates: candidatesFor(g.p, { markets: ["result", "double_chance", "goals", "btts"], picksPerGame: 1, allowHandicap: false }).filter((c) => isQuotable(c.market) && !c.market.startsWith("ah:")),
      })).filter((e) => e.candidates.length > 0);
      if (pool.length < 2) continue;
      built++;
      const used = new Set<string>();
      let any = false;
      V1_TIERS.forEach((t, ti) => {
        const { legs } = forge(pool, { risk: t.risk, targetOdds: t.target, games: t.games, picksPerGame: 1, markets: ["result", "double_chance", "goals", "btts"], when: "today", leagues: "all", stake: 1000 }, { locked: [], removed: [], avoid: [...used], seed: daySeed(String(day)) + ti });
        if (legs.length < t.games) return;
        legs.forEach((l) => used.add(l.matchId));
        s[ti].built++;
        s[ti].expected += legs.reduce((a, l) => a * l.probability, 1);
        if (gradeLegs(legs, rows).all) { s[ti].landed++; any = true; }
      });
      if (any) anyDays++;
    }
    console.log(`\n  v1 (16 Oct hub): at least one code landed on ${((100 * anyDays) / Math.max(1, built)).toFixed(0)}% of ${built} days`);
    console.log("    " + V1_TIERS.map((t, i) => `${t.target}: ${s[i].built ? ((100 * s[i].landed) / s[i].built).toFixed(1) : "—"}% (exp ${s[i].built ? ((100 * s[i].expected) / s[i].built).toFixed(1) : "—"}%)`).join("   "));
  }

  type Example = { day: number; tier: string; odds: number; chance: number; landed: boolean; legs: string[]; misses: number };
  const examples: Example[] = [];
  // --hub=0,6,7 replays only those variants (by position in HUB_VARIANTS).
  const pick = arg("hub")?.split(",").map(Number);
  for (const v of HUB_VARIANTS.filter((_, i) => !pick || pick.includes(i))) {
    const stats = new Map(HUB_TIERS.map((t) => [t.id, { built: 0, landed: 0, expected: 0, legs: 0, legN: 0, legWins: 0, legProb: 0, span: 0 }]));
    const mix = new Map<string, number>();
    let anyDays = 0, builtDays = 0, dailyAny = 0;
    for (const day of days) {
      const toPool = (gs: Graded[]): PoolEntry[] => gs.map((g) => ({
        prediction: g.p,
        candidates: candidatesFor(g.p, { markets: HUB_FORGE_MARKETS, picksPerGame: 1, allowHandicap: true }),
      }));
      const today = toPool(byDay.get(day)!);
      const ahead = toPool(days.filter((d) => d >= day && d < day + 4 * DAY).flatMap((d) => byDay.get(d)!));
      const codes = buildHub(today, String(day), ahead, v.allow, v.options);
      // Days counted are days with at least one daily code, as for v1.
      if (!codes.some((c) => hubTier(c.tier)!.days === 1)) continue;
      builtDays++;
      let any = false, anyDaily = false;
      for (const c of codes) {
        const s = stats.get(c.tier)!;
        s.built++;
        s.expected += c.legs.reduce((a, l) => a * l.probability, 1);
        s.legs += c.legs.length;
        const ks = c.legs.map((l) => Date.parse(l.kickoff));
        s.span += (Math.max(...ks) - Math.min(...ks)) / DAY;
        const g = gradeLegs(c.legs, rows);
        s.legN += c.legs.length;
        s.legWins += g.wins;
        s.legProb += c.legs.reduce((a, l) => a + l.probability, 0);
        for (const l of c.legs) {
          const f = l.market.startsWith("ah:") ? "handicap" : l.market.startsWith("ou:") ? "over 1.5" : l.market.startsWith("dc") ? "double chance" : "match result";
          mix.set(f, (mix.get(f) ?? 0) + 1);
        }
        if (g.all) {
          s.landed++;
          any = true;
          if (hubTier(c.tier)!.days === 1) anyDaily = true;
        }
        if (v === HUB_VARIANTS[0] && hubTier(c.tier)!.days === 4) {
          examples.push({
            day,
            tier: c.tier,
            odds: c.legs.reduce((a, l) => a * l.fairOdds, 1),
            chance: c.legs.reduce((a, l) => a * l.probability, 1),
            landed: g.all,
            misses: c.legs.length - g.wins,
            legs: [...c.legs].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)).map((l) => {
              const r = rows.get(l.matchId)!;
              const res = won(l.market, r);
              const mark = res === "win" ? "✓" : res === "push" ? "void" : "✗";
              return `${new Date(l.kickoff).toISOString().slice(0, 10)}  ${l.homeName} ${r.homeGoals}-${r.awayGoals} ${l.awayName}  ${l.label} (${Math.round(l.probability * 100)}%)  ${mark}`;
            }),
          });
        }
      }
      if (any) anyDays++;
      if (anyDaily) dailyAny++;
    }
    const totalLegs = [...mix.values()].reduce((a, b) => a + b, 0);
    console.log(`\n  ${v.name}`);
    console.log(`    at least one daily code (2-20) landed on ${((100 * dailyAny) / Math.max(1, builtDays)).toFixed(0)}% of ${builtDays} days; any code incl. 50/100 on ${((100 * anyDays) / Math.max(1, builtDays)).toFixed(0)}%`);
    console.log(`    legs: ${[...mix].map(([k, n]) => `${k} ${((100 * n) / totalLegs).toFixed(0)}%`).join(", ")}`);
    console.log("    target   built  landed  expected  avg legs  leg landed  leg stated  span (days)");
    for (const t of HUB_TIERS) {
      const s = stats.get(t.id)!;
      if (!s.built) continue;
      console.log(
        `    ${t.id.padStart(5)}   ${String(s.built).padStart(5)}  ${((100 * s.landed) / s.built).toFixed(1).padStart(5)}%   ${((100 * s.expected) / s.built).toFixed(1).padStart(5)}%    ${(s.legs / s.built).toFixed(1).padStart(4)}      ${((100 * s.legWins) / s.legN).toFixed(1).padStart(5)}%     ${((100 * s.legProb) / s.legN).toFixed(1).padStart(5)}%      ${(s.span / s.built).toFixed(1)}`,
      );
    }
  }
  return examples;
}

function printExamples(examples: { day: number; tier: string; odds: number; chance: number; landed: boolean; legs: string[]; misses: number }[]) {
  console.log("\n7. FOUR-DAY CODES: EVERY ONE THAT LANDED, AND SOME THAT MISSED");
  for (const tier of ["50", "100"]) {
    const ex = examples.filter((e) => e.tier === tier);
    const won = ex.filter((e) => e.landed);
    const byOne = ex.filter((e) => !e.landed && e.misses === 1);
    console.log(`\n  ${tier}-odds: ${won.length} of ${ex.length} landed; ${byOne.length} missed by one leg`);
    const odds = ex.map((e) => e.odds).sort((a, b) => a - b);
    const q = (f: number) => odds[Math.min(odds.length - 1, Math.floor(f * odds.length))]?.toFixed(1);
    const short = (f: number) => ex.filter((e) => e.odds < f * Number(tier)).length;
    console.log(`  odds: lowest ${q(0)}, quartiles ${q(0.25)} / ${q(0.5)} / ${q(0.75)}, highest ${q(1)}; under 80% of target ${short(0.8)}, under 90% ${short(0.9)}`);
    const show = (e: (typeof ex)[number]) => {
      console.log(`\n    ${e.landed ? "LANDED" : `MISSED (${e.misses} leg${e.misses === 1 ? "" : "s"} lost)`}  built ${new Date(e.day).toISOString().slice(0, 10)}  odds ${e.odds.toFixed(2)}  model chance ${(100 * e.chance).toFixed(1)}%`);
      for (const l of e.legs) console.log(`      ${l}`);
    };
    won.forEach(show);
    byOne.slice(0, 2).forEach(show);
    ex.filter((e) => !e.landed && e.misses >= 3).slice(0, 1).forEach(show);
  }
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const only = arg("only")?.split(",");
  const round = arg("round") ?? "2";
  const all: Graded[] = [];
  for (const d of DIVS.filter((x) => !only || only.includes(x.div))) {
    process.stderr.write(`${d.div}… `);
    all.push(...walk(d, await load(d.div), days));
  }
  process.stderr.write(`\n${all.length} publishable fixtures\n`);
  if (round === "1") {
    calibration(all);
    overUnder(all);
    digest(all);
  }
  const examples = hub(all);
  printExamples(examples);
  if (arg("examples") === undefined) {
    headline(all);
    digest2(all);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
