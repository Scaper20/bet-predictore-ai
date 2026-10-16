/**
 * Research only: the UEFA cups, rated two ways. Nothing here changes the model.
 *
 *   A  production   trained on the last two years of the three UEFA cups only
 *                   (LeagueDef.cupPool), so a club is rated on its European
 *                   games alone;
 *   B  pooled       the same cup games plus the last year of every catalogued
 *                   European league, so a club's domestic season counts too and
 *                   the cup games tie the leagues to one another;
 *   C  pooled ratings with the cup fit's own home advantage and scoring level,
 *                   since a domestic-heavy fit carries the leagues' values.
 *
 * Walk-forward over the cup games of the last N days (default 365): each is
 * predicted from a fit on rows strictly before its matchday.
 *
 * Reads the public results archive (historical_results) with the publishable
 * key: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/cups-lab.ts
 */

import { buildPrediction, headlineEligible, type Pick, type Prediction } from "../src/lib/model/predict";
import { fitLeague, normaliseKey } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import type { Match, ResultRow } from "../src/lib/types";

const DAY = 86_400_000;
const CUPS = ["champions-league", "europa-league", "conference-league"];
const TOP5 = ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"];
const DOMESTIC = [...TOP5, "eredivisie", "primeira-liga", "belgian-pro-league", "scottish-premiership", "super-lig", "greek-super-league"];
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

interface Raw {
  league_code: string;
  kickoff: string;
  home_name: string;
  away_name: string;
  home_goals: number;
  away_goals: number;
  source: string;
}

async function fetchAll(filter: string): Promise<Raw[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const out: Raw[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${url}/rest/v1/historical_results?select=league_code,kickoff,home_name,away_name,home_goals,away_goals,source&${filter}&order=kickoff.asc`,
      { headers: { apikey: key, Range: `${from}-${from + 999}` } },
    );
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const page = (await r.json()) as Raw[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out.filter((x) => Number.isFinite(x.home_goals) && Number.isFinite(x.away_goals));
}

const toRow = (r: Raw, rename: (n: string) => string = (n) => n): ResultRow => ({
  leagueId: r.league_code,
  date: Date.parse(r.kickoff),
  homeId: rename(r.home_name),
  homeName: rename(r.home_name),
  awayId: rename(r.away_name),
  awayName: rename(r.away_name),
  homeGoals: r.home_goals,
  awayGoals: r.away_goals,
});

/**
 * Domestic spelling -> cup spelling, where one key holds the other
 * ("leverkusen" in "bayerleverkusen", "milan" for "AC Milan"). A domestic
 * name that matches two cup clubs is left alone rather than guessed.
 */
function nameMap(cupNames: Set<string>, domesticNames: Set<string>): Map<string, string> {
  const cupKeys = [...cupNames].map((n) => ({ n, k: normaliseKey(n) }));
  const map = new Map<string, string>();
  for (const d of domesticNames) {
    const dk = normaliseKey(d);
    if (dk.length < 4) continue;
    const exact = cupKeys.filter((c) => c.k === dk);
    const hits = exact.length ? exact : cupKeys.filter((c) => c.k.length >= 4 && (c.k.includes(dk) || dk.includes(c.k)));
    if (hits.length === 1) map.set(d, hits[0].n);
  }
  return map;
}

function toMatch(r: ResultRow, code: string): Match {
  return {
    id: `cup:${code}:${r.date}:${r.homeName}`,
    kickoff: new Date(r.date).toISOString(),
    status: "scheduled",
    league: { id: code, name: code, code },
    home: { id: r.homeName, name: r.homeName, shortName: r.homeName },
    away: { id: r.awayName, name: r.awayName, shortName: r.awayName },
    score: { home: null, away: null },
  } as Match;
}

class Score {
  n = 0; picks = 0; pickWins = 0; ll = 0; brier = 0;
  homeP = 0; homeW = 0;
  // Host outside the top five leagues, visitor inside them.
  under = { n: 0, homeOrDraw: 0, statedHomeOrDraw: 0, homeSidePicks: 0, homeSideWins: 0 };
  add(p: Prediction, r: ResultRow, hostTop5: boolean, visitorTop5: boolean) {
    const o = r.homeGoals > r.awayGoals ? 0 : r.homeGoals === r.awayGoals ? 1 : 2;
    const probs = [p.markets.home, p.markets.draw, p.markets.away];
    this.n++;
    this.ll += -Math.log(Math.max(1e-6, probs[o]));
    this.brier += probs.reduce((a, v, i) => a + (v - (i === o ? 1 : 0)) ** 2, 0);
    this.homeP += p.markets.home;
    if (o === 0) this.homeW++;
    if (p.topPick) {
      const g = evaluatePick(p.topPick.market, r.homeGoals, r.awayGoals);
      if (g && g !== "push") {
        this.picks++;
        if (g === "win") this.pickWins++;
      }
    }
    if (!hostTop5 && visitorTop5) {
      this.under.n++;
      if (o !== 2) this.under.homeOrDraw++;
      this.under.statedHomeOrDraw += p.markets.home + p.markets.draw;
      const m = p.topPick?.market ?? "";
      if (m === "1x2:home" || m === "dc:home-draw") {
        this.under.homeSidePicks++;
        if (o !== 2 && (m === "dc:home-draw" || o === 0)) this.under.homeSideWins++;
      }
    }
  }
  print(label: string) {
    const pc = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
    console.log(`\n${label}`);
    console.log(`  cup games ${this.n}   published pick landed ${pc(this.pickWins, this.picks)} of ${this.picks}`);
    console.log(`  1X2 log loss ${(this.ll / this.n).toFixed(4)}   Brier ${(this.brier / this.n).toFixed(4)}   (lower is better)`);
    console.log(`  home win: stated ${pc(this.homeP, this.n)}  actual ${pc(this.homeW, this.n)}`);
    const u = this.under;
    console.log(`  host outside the top five, visitor from one (${u.n} games):`);
    console.log(`    home or draw: stated ${pc(u.statedHomeOrDraw, u.n)}  actual ${pc(u.homeOrDraw, u.n)}`);
    console.log(`    published pick on the host side: ${u.homeSidePicks}, landed ${pc(u.homeSideWins, u.homeSidePicks)}`);
  }
}

const isUnder = (m: string) => m.startsWith("ou:under");
const isHalfAh = (m: string) => m.startsWith("ah:") && Math.abs((Number(m.split(":")[2]) * 2) % 2) === 1;
/** A pick that needs the host to avoid defeat or win. */
const hostSide = (m: string) => m === "1x2:home" || m === "dc:home-draw" || m.startsWith("ah:home:");

function choose(p: Prediction, o: { noUnder?: boolean; guard?: boolean; ah?: boolean }, guarded: boolean): Pick | null {
  const ok = (x: Pick) => x.probability >= 0.4 && !(o.noUnder && isUnder(x.market)) && !(o.guard && guarded && hostSide(x.market));
  const main = p.picks.find((x) => headlineEligible(x) && ok(x));
  if (main || !o.ah) return main ?? null;
  return p.picks.filter((x) => isHalfAh(x.market) && x.probability >= 0.6 && x.probability <= 0.8 && ok(x)).sort((a, b) => b.probability - a.probability)[0] ?? null;
}

/** The published pick under each rule, on the production cup model (A). */
function pickRules(rows: { p: Prediction; row: ResultRow; ht: boolean; at: boolean }[]) {
  const rules: [string, { noUnder?: boolean; guard?: boolean; ah?: boolean }][] = [
    ["today", {}],
    ["unders paused", { noUnder: true }],
    ["unders paused + host guard", { noUnder: true, guard: true }],
    ["unders paused + host guard + handicap fallback", { noUnder: true, guard: true, ah: true }],
  ];
  console.log("\nPublished pick rules on the production cup model (A):");
  for (const [name, o] of rules) {
    let n = 0, w = 0, gn = 0, gw = 0, none = 0;
    for (const x of rows) {
      if (!x.p.sufficiency.publishable) continue;
      const guarded = !x.ht && x.at;
      const pk = choose(x.p, o, guarded);
      if (!pk) { none++; continue; }
      const g = evaluatePick(pk.market, x.row.homeGoals, x.row.awayGoals);
      if (!g || g === "push") continue;
      n++; if (g === "win") w++;
      if (guarded) { gn++; if (g === "win") gw++; }
    }
    const pc = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
    console.log(`  ${name.padEnd(48)} landed ${pc(w, n)} of ${n}   in guarded games ${pc(gw, gn)} of ${gn}   no pick ${none}`);
  }
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const since = new Date(Date.now() - (days + 760) * DAY).toISOString();
  const cupRaw = await fetchAll(`league_code=in.(${CUPS.join(",")})&source=eq.thesportsdb&kickoff=gte.${since}`);
  const domRaw = await fetchAll(`league_code=in.(${DOMESTIC.join(",")})&kickoff=gte.${since}`);
  process.stderr.write(`cup rows ${cupRaw.length}, domestic rows ${domRaw.length}\n`);

  const cupNames = new Set(cupRaw.flatMap((r) => [r.home_name, r.away_name]));
  const domNames = new Set(domRaw.flatMap((r) => [r.home_name, r.away_name]));
  const map = nameMap(cupNames, domNames);
  const rename = (n: string) => map.get(n) ?? n;
  process.stderr.write(`domestic clubs linked to a cup spelling: ${new Set(map.values()).size}\n`);

  // Which cup clubs play in a top-five league (by their linked domestic rows).
  const top5 = new Set<string>();
  for (const r of domRaw) if (TOP5.includes(r.league_code)) for (const n of [r.home_name, r.away_name]) top5.add(rename(n));

  const cupRows = cupRaw.map((r) => ({ code: r.league_code, row: toRow(r) })).sort((a, b) => a.row.date - b.row.date);
  const domRows = domRaw.map((r) => toRow(r, rename)).sort((a, b) => a.date - b.date);

  const end = Date.now();
  const targets = cupRows.filter((x) => x.row.date >= end - days * DAY);
  const A = new Score();
  const B = new Score();
  const C = new Score();
  const fitsA = new Map<number, ReturnType<typeof fitLeague>>();
  const fitsB = new Map<number, ReturnType<typeof fitLeague>>();
  const showcase: string[] = [];
  const kept: { p: Prediction; row: ResultRow; ht: boolean; at: boolean }[] = [];
  const WATCH = /salzburg|lech|viking|sabah|inter milan|club brugge|bod/i;

  for (const t of targets) {
    const day = Math.floor(t.row.date / DAY) * DAY;
    const priorCup = cupRows.filter((x) => x.row.date < day && x.row.date >= day - 730 * DAY).map((x) => x.row).slice(-1200);
    const priorDom = domRows.filter((r) => r.date < day && r.date >= day - 365 * DAY);
    let fa = fitsA.get(day);
    if (!fa) fitsA.set(day, (fa = fitLeague(priorCup)));
    let fb = fitsB.get(day);
    const pooled = [...priorDom, ...priorCup].sort((a, b) => a.date - b.date);
    if (!fb) fitsB.set(day, (fb = fitLeague(pooled)));
    const m = toMatch(t.row, t.code);
    const pa = buildPrediction(m, priorCup, [], { prefit: fa });
    const pb = buildPrediction(m, pooled, [], { prefit: fb });
    // C: pooled ratings, with the cups' own scoring level and home advantage.
    const fc = { ...fb, homeAdvantage: fa.homeAdvantage, baseRate: fa.baseRate };
    const pc = buildPrediction(m, pooled, [], { prefit: fc });
    const ht = top5.has(t.row.homeName), at = top5.has(t.row.awayName);
    A.add(pa, t.row, ht, at);
    kept.push({ p: pa, row: t.row, ht, at });
    B.add(pb, t.row, ht, at);
    C.add(pc, t.row, ht, at);
    if (WATCH.test(`${t.row.homeName} ${t.row.awayName}`) && t.row.date > end - 30 * DAY) {
      const f = (p: Prediction) => `${Math.round(100 * p.markets.home)}/${Math.round(100 * p.markets.draw)}/${Math.round(100 * p.markets.away)} pick ${p.topPick?.label ?? "—"}`;
      showcase.push(`  ${t.row.homeName} ${t.row.homeGoals}-${t.row.awayGoals} ${t.row.awayName}\n     A ${f(pa)}\n     B ${f(pb)}\n     C ${f(pc)}`);
    }
  }

  A.print("A  PRODUCTION: rated on the UEFA cups only");
  B.print("B  POOLED: UEFA cups plus the catalogued European leagues");
  C.print("C  POOLED RATINGS, CUP HOME ADVANTAGE AND SCORING LEVEL");
  pickRules(kept);
  if (showcase.length) {
    console.log("\nRecent games (home/draw/away %):");
    console.log(showcase.join("\n"));
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
