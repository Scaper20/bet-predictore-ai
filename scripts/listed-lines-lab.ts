/**
 * Research only: corners and shots picks chosen from the lines SportyBet
 * actually lists, against the fixed-line rules they replace.
 *
 * SportyBet sets its stat lines near the middle of each game. From its board
 * in October 2026 (odds_boards, 356 games): corners totals carry about 1.5
 * lines a game (mostly 9.5 / 10.5), team corners about 5, the corner
 * handicap about 2, shots-on-target totals about 3, team shots on target
 * about 3, shots totals about 4, team shots about 3; the "most" (1X2)
 * markets are always there; no shots handicap and no "level or more"
 * market at all. There is no history of which lines it listed, so the lab
 * stands its ladder in with the model's own distribution: for each family,
 * the k lines closest to 50/50 (k as above). That is generous to the old
 * rules only in one place (none of them is listed in practice), so it
 * cannot flatter the new rule.
 *
 * Reads the walk-forward cache written by scripts/niche-lab.ts --stage=predict
 * (17 divisions, July 2024 on) and reports, all at the model's chances:
 *   A  the published goals/result pick alone;
 *   B  the old fixed corners/shots rules: how often each fires, how often
 *      its line would be listed, and how it landed;
 *   C  the best listed corners/shots line per game at several floors;
 *   D  the published pick, replaced by C's line where that line is the
 *      stronger read: the rule the site runs (market-check.ts boardChecked).
 *
 *   npx tsx scripts/listed-lines-lab.ts
 */

import fs from "node:fs";
import { gradeLeg } from "../src/lib/leg-pricing";
import { statGrid, STAT_LINES } from "../src/lib/model/match-stats";
import { SWEET_SPOTS, SWEET_SPOT_FILLERS, SWEET_SPOT_MAX } from "../src/lib/model/sweet-spots";
import type { Pred } from "./niche-lab";
import { CACHE } from "./lib/football-data-uk";
import path from "node:path";

// Read the cache directly: importing niche-lab would run its own analysis.
const PREDS_FILE = path.join(CACHE, "niche-preds.json");
/** SportyBet's margin on a stat line, about 7% (the board, October 2026): its price is 1 / (p × 1.07). */
const MARGIN = 1.07;
/** board-pick.ts LISTED_MIN_PRICE: shorter than this, no pick. */
const MIN_PRICE = 1.18;
const priced = (p: number) => 1 / (p * MARGIN) >= MIN_PRICE;

const PREFIX: Record<"corners" | "shots" | "shotsOnTarget", string> = { corners: "corners", shots: "shots", shotsOnTarget: "sot" };
const KINDS = ["corners", "shots", "shotsOnTarget"] as const;

/** Lines SportyBet lists per game, by family (board averages, rounded). */
const LADDER: Record<(typeof KINDS)[number], { total: number; team: number; handicap: number }> = {
  corners: { total: 2, team: 5, handicap: 2 },
  shots: { total: 4, team: 3, handicap: 0 },
  shotsOnTarget: { total: 3, team: 3, handicap: 0 },
};

interface Line {
  market: string;
  p: number;
  won: boolean | null;
}

/** A grid's count distributions, so every line's chance is a sum over one array, not the whole grid. */
interface Dists { total: number[]; home: number[]; away: number[]; diff: Map<number, number> }

function dists(grid: number[][]): Dists {
  const n = grid.length;
  const total = new Array<number>(2 * n).fill(0), home = new Array<number>(n).fill(0), away = new Array<number>(n).fill(0);
  const diff = new Map<number, number>();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const p = grid[i][j];
    if (!(p > 0)) continue;
    total[i + j] += p; home[i] += p; away[j] += p;
    diff.set(i - j, (diff.get(i - j) ?? 0) + p);
  }
  return { total, home, away, diff };
}

const above = (xs: number[], line: number) => xs.reduce((s, p, k) => (k > line ? s + p : s), 0);
const below = (xs: number[], line: number) => xs.reduce((s, p, k) => (k < line ? s + p : s), 0);
const diffWhere = (d: Map<number, number>, ok: (x: number) => boolean) => [...d].reduce((s, [x, p]) => (ok(x) ? s + p : s), 0);

/** The chance a half-line stat market lands (over/under, team, handicap, most). */
function chance(market: string, d: Dists): number {
  const parts = market.split(":");
  const line = Number(parts[parts.length - 1]);
  if (parts[1] === "over") return above(d.total, line);
  if (parts[1] === "under") return below(d.total, line);
  if (parts[1] === "home" || parts[1] === "away") {
    const xs = parts[1] === "home" ? d.home : d.away;
    return parts[2] === "over" ? above(xs, line) : below(xs, line);
  }
  if (parts[1] === "hcp") {
    // Home with h: home + h beats away, i.e. home - away > -h; away with a: away - home > -a.
    return parts[2] === "home" ? diffWhere(d.diff, (x) => x > -line) : diffWhere(d.diff, (x) => -x > -line);
  }
  if (parts[1] === "most") {
    const side = parts[2];
    if (side === "home") return diffWhere(d.diff, (x) => x > 0);
    if (side === "away") return diffWhere(d.diff, (x) => x < 0);
    if (side === "home-or-level") return diffWhere(d.diff, (x) => x >= 0);
    if (side === "away-or-level") return diffWhere(d.diff, (x) => x <= 0);
  }
  return 0;
}

const graded = (market: string, h: number, a: number): boolean | null => {
  const g = gradeLeg(market, h, a);
  return g === null ? null : g === "win" || g === "halfWin" ? true : g === "lose" || g === "halfLose" ? false : null;
};

/** Both sides of every half line from lo to hi, written our way. */
function ladderLines(kind: (typeof KINDS)[number], grid: Dists, actual: [number, number]) {
  const p = PREFIX[kind];
  const half = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i + 0.5);
  const max = kind === "corners" ? 18 : kind === "shots" ? 40 : 16;
  const teamMax = kind === "corners" ? 12 : kind === "shots" ? 24 : 12;
  const families: { lines: string[][]; k: number }[] = [];
  // Each listed line is an over/under pair; the ladder keeps the k pairs nearest 50/50.
  const pairs = (keys: (l: number) => [string, string], ls: number[]) => ls.map((l) => keys(l));
  families.push({ lines: pairs((l) => [`${p}:over:${l}`, `${p}:under:${l}`], half(0, max)), k: LADDER[kind].total });
  for (const side of ["home", "away"]) families.push({ lines: pairs((l) => [`${p}:${side}:over:${l}`, `${p}:${side}:under:${l}`], half(0, teamMax)), k: LADDER[kind].team });
  if (LADDER[kind].handicap) {
    const hs = [-4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5];
    families.push({ lines: hs.map((h) => [`${p}:hcp:home:${h > 0 ? "+" : ""}${h}`, `${p}:hcp:away:${-h > 0 ? "+" : ""}${-h}`]), k: LADDER[kind].handicap });
  }
  const out: Line[] = [];
  for (const f of families) {
    const priced = f.lines.map((pair) => pair.map((m) => ({ market: m, p: chance(m, grid) })));
    priced.sort((a, b) => Math.abs(a[0].p - 0.5) - Math.abs(b[0].p - 0.5));
    for (const pair of priced.slice(0, f.k)) for (const x of pair) out.push({ ...x, won: graded(x.market, actual[0], actual[1]) });
  }
  for (const side of ["home", "away"]) {
    const m = `${p}:most:${side}`;
    out.push({ market: m, p: chance(m, grid), won: graded(m, actual[0], actual[1]) });
  }
  return out;
}

interface Tally { n: number; won: number; stated: number }
const tally = (): Tally => ({ n: 0, won: 0, stated: 0 });
const add = (t: Tally, p: number, won: boolean) => { t.n++; t.stated += p; if (won) t.won++; };
const show = (t: Tally, of?: number) =>
  t.n ? `${String(t.n).padStart(6)} picks${of ? ` (${((100 * t.n) / of).toFixed(0).padStart(3)}% of games)` : ""}  landed ${((100 * t.won) / t.n).toFixed(1)}%  stated ${((100 * t.stated) / t.n).toFixed(1)}%` : "     — no picks";

function main() {
  const preds: Pred[] = JSON.parse(fs.readFileSync(PREDS_FILE, "utf8"));
  const withStats = preds.filter((r) => KINDS.every((k) => r.st[k] && r.st[k]![6] >= 0));
  console.log(`${preds.length} games, ${withStats.length} with corners, shots and shots on target recorded\n`);

  const floors = [0.66, 0.68, 0.7, 0.72, 0.75, 0.78];
  const A = tally();
  const Bfire = tally(), Blisted = tally();
  const C = new Map(floors.map((f) => [f, tally()]));
  const D = new Map(floors.map((f) => [f, { all: tally(), stat: tally() }]));
  // E: what the site runs. Only where an old corners/shots rule fired is the
  // pick moved, to the best listed line, else to the goals/result pick.
  const E = new Map(floors.map((f) => [f, { all: tally(), stat: tally(), pubOnly: tally(), firedGames: 0 }]));
  const byFamily = new Map<string, Tally>();
  const oldRules = [...SWEET_SPOTS, ...SWEET_SPOT_FILLERS].filter((r) => /^(corners|shots|sot):/.test(r.market));

  for (const r of withStats) {
    const lines: Line[] = [];
    const all = new Map<string, number>();
    for (const k of KINDS) {
      const v = r.st[k]!;
      const grid = dists(statGrid({ home: v[0], away: v[1] }, { kTotal: v[2], rho: v[3] }, STAT_LINES[k].max));
      lines.push(...ladderLines(k, grid, [v[6], v[7]]));
      for (const rule of oldRules) if (rule.market.startsWith(`${PREFIX[k]}:`)) all.set(rule.market, chance(rule.market, grid));
    }
    const actualOf = (m: string): [number, number] => {
      const k = KINDS.find((x) => m.startsWith(`${PREFIX[x]}:`))!;
      const v = r.st[k]!;
      return [v[6], v[7]];
    };

    // A: the published goals/result pick.
    const pub = r.pub;
    const pubWon = pub ? graded(pub[0], r.hg, r.ag) : null;
    if (pub && pubWon !== null) add(A, pub[1], pubWon);

    // B: the old fixed rules, best record first, as sweetSpotPick chose.
    const fired = oldRules.filter((rule) => (all.get(rule.market) ?? 0) >= rule.min && (all.get(rule.market) ?? 0) <= SWEET_SPOT_MAX).sort((a, b) => b.record - a.record)[0];
    if (fired) {
      const p = all.get(fired.market)!;
      const won = graded(fired.market, ...actualOf(fired.market));
      if (won !== null) add(Bfire, p, won);
      if (lines.some((l) => l.market === fired.market) && won !== null) add(Blisted, p, won);
    }

    // C and D: the best listed line at each floor.
    for (const f of floors) {
      const best = lines.filter((l) => l.won !== null && l.p >= f && l.p <= SWEET_SPOT_MAX && priced(l.p)).sort((a, b) => b.p - a.p)[0];
      if (best) {
        add(C.get(f)!, best.p, best.won!);
        if (f === 0.72) {
          const fam = best.market.replace(/:-?\+?[\d.]+$/, "").replace(/:(home|away)(?=:)/, ":team");
          const t = byFamily.get(fam) ?? tally();
          add(t, best.p, best.won!);
          byFamily.set(fam, t);
        }
      }
      const d = D.get(f)!;
      const statWins = best && (!pub || best.p > pub[1]);
      if (statWins) { add(d.all, best.p, best.won!); add(d.stat, best.p, best.won!); }
      else if (pub && pubWon !== null) add(d.all, pub[1], pubWon);
      if (fired) {
        const e = E.get(f)!;
        e.firedGames++;
        if (best) { add(e.all, best.p, best.won!); add(e.stat, best.p, best.won!); }
        else if (pub && pubWon !== null) add(e.all, pub[1], pubWon);
        if (pub && pubWon !== null) add(e.pubOnly, pub[1], pubWon);
      }
    }
  }

  const n = withStats.length;
  console.log("A  published goals/result pick");
  console.log(`   ${show(A, n)}\n`);
  console.log("B  old fixed corners/shots rules (Under 12.5 corners, SOT handicaps, ...)");
  console.log(`   fired      ${show(Bfire, n)}`);
  console.log(`   listed     ${show(Blisted, n)}   <- the share SportyBet would carry\n`);
  console.log("C  best listed corners/shots line, by floor");
  for (const f of floors) console.log(`   ${f.toFixed(2)}  ${show(C.get(f)!, n)}`);
  console.log("\n   at 0.72, by family:");
  for (const [fam, t] of [...byFamily].sort((a, b) => b[1].n - a[1].n)) console.log(`     ${fam.padEnd(22)} ${show(t)}`);
  console.log("\nD  published pick, replaced by the listed line whenever that line is the stronger read");
  for (const f of floors) {
    const d = D.get(f)!;
    console.log(`   ${f.toFixed(2)}  all ${show(d.all)}   of which corners/shots ${show(d.stat)}`);
  }
  console.log("\nE  only the games where an old corners/shots rule fired: moved to the best listed line, else the goals/result pick");
  for (const f of floors) {
    const e = E.get(f)!;
    console.log(`   ${f.toFixed(2)}  ${e.firedGames} games: ${show(e.all)}   of which corners/shots ${show(e.stat)}   (goals/result pick on the same games: ${show(e.pubOnly)})`);
  }
}

main();
