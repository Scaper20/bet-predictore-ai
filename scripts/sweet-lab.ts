/**
 * Sweet-spot upgrade lab: is there a better way to build the rule table than
 * the one in src/lib/model/sweet-spots.ts?
 *
 * Reads ranker-only records (audit-eval.ts --cfg=ns_v3, sweet spots off) and
 * replays the pick layer over them several ways, each one walk-forward: the
 * rules used in a month are found only on games before that month.
 *
 *   shipped    the table in sweet-spots.ts as it is (goal rules, not paused)
 *   refit      same recipe (lowest chance where the band lands TARGET with
 *              100+ picks), refitted every month on the trailing window
 *   marginal   the threshold is where the pick AT the threshold lands the
 *              target (isotonic fit), not where the whole band averages it
 *   calibrated no table: each game takes the candidate whose calibrated
 *              chance is highest, when that clears the floor
 *
 *   npx tsx scripts/sweet-lab.ts --dir=<scratch> [--cfg=ns_v3] [--pre=ns_v3_pre] [--boot=1000]
 *
 * Stat rules (corners, shots) need the count model and are left out of every
 * arm alike; whole-line handicaps over a goal are paused in production.
 */

import fs from "node:fs";
import path from "node:path";
import { evaluatePick } from "../src/lib/settlement";
import { SWEET_SPOTS, SWEET_SPOT_MAX, type SweetSpot } from "../src/lib/model/sweet-spots";
import { pausedByRule } from "../src/lib/model/paused";
import { deVig } from "../src/lib/model/backtest";
import type { Rec } from "./audit-eval";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const dir = arg("dir") ?? "/tmp";
const BOOT = Number(arg("boot") ?? 1000);
const CAP = SWEET_SPOT_MAX;
const DAY = 86_400_000;
const T = (s: string) => Date.parse(s);

export const SHIPPED: SweetSpot[] = SWEET_SPOTS.filter((r) => !r.market.startsWith("corners") && !pausedByRule(r.market));
const BASE_MARKETS = SHIPPED.map((r) => r.market);
const WIDE_MARKETS = [...BASE_MARKETS, "1x2:away", "ou:over:2.5", "btts:yes"];

const WINDOWS: [string, number, number][] = [
  ["All, Aug 2023 - Oct 2026", T("2023-08-01"), T("2026-11-01")],
  ["2023-24", T("2023-08-01"), T("2024-07-01")],
  ["2024-25", T("2024-07-01"), T("2025-07-01")],
  ["2025-26", T("2025-07-01"), T("2026-07-01")],
  ["Sep-Oct 2026", T("2026-09-01"), T("2026-11-01")],
];

export function chance(market: string, r: Rec): number | null {
  const m = market.match(/^ah:(home|away):(-?\d+)$/);
  if (m) {
    const line = m[1] === "home" ? Number(m[2]) : -Number(m[2]);
    const win = r.p[market];
    const push = r.p[`ahpush:${line}`];
    return win === undefined || push === undefined ? null : win / Math.max(1e-9, 1 - push);
  }
  return r.p[market] ?? null;
}

/** The closing price's fair chance of a result-family selection (win against loss for draw no bet). */
export function marketFair(market: string, r: Rec): number | null {
  if (!r.close) return null;
  const [h, d, a] = deVig(r.close);
  switch (market) {
    case "1x2:home": return h;
    case "1x2:away": return a;
    case "1x2:draw": return d;
    case "dc:home-draw": return h + d;
    case "dc:away-draw": return a + d;
    case "dc:home-away": return h + a;
    case "ah:home:0": return h / (h + a);
    case "ah:away:0": return a / (h + a);
    case "ah:home:0.5": return h + d;
    case "ah:away:0.5": return a + d;
    case "ah:home:-0.5": return h;
    case "ah:away:-0.5": return a;
    default: return null;
  }
}

interface Obs { p: number; win: boolean }

function observations(rs: readonly Rec[], market: string): Obs[] {
  const out: Obs[] = [];
  for (const r of rs) {
    const p = chance(market, r);
    if (p === null) continue;
    const o = evaluatePick(market, r.hg, r.ag);
    if (o === "win" || o === "lose") out.push({ p, win: o === "win" });
  }
  return out;
}

/** Today's recipe: the lowest chance at which the band up to the cap landed `target` with `minN`+ picks. */
export function deriveBand(rs: readonly Rec[], markets: readonly string[], target: number, minN = 100): SweetSpot[] {
  const out: SweetSpot[] = [];
  for (const market of markets) {
    const rows = observations(rs, market).filter((x) => x.p <= CAP);
    for (let t = 0.5; t <= CAP + 1e-9; t += 0.01) {
      const sel = rows.filter((x) => x.p >= t - 1e-9);
      if (sel.length < minN) break;
      const hit = sel.filter((x) => x.win).length / sel.length;
      if (hit >= target) {
        out.push({ market, min: Math.round(t * 100) / 100, record: hit });
        break;
      }
    }
  }
  return out;
}

/** Isotonic (never-falling) fit of how often a market landed at each stated chance, in 0.01 steps from 0.50 to the cap. */
export function isotonic(obs: readonly Obs[]): { lo: number; rate: number; n: number }[] {
  const bins = new Map<number, { w: number; n: number }>();
  for (const x of obs) {
    if (x.p < 0.5 || x.p > CAP) continue;
    const k = Math.min(Math.round(CAP * 100) - 1, Math.floor(x.p * 100 + 1e-9));
    const b = bins.get(k) ?? { w: 0, n: 0 };
    b.n++;
    if (x.win) b.w++;
    bins.set(k, b);
  }
  const blocks: { ks: number[]; w: number; n: number }[] = [];
  for (const k of [...bins.keys()].sort((a, b) => a - b)) {
    blocks.push({ ks: [k], w: bins.get(k)!.w, n: bins.get(k)!.n });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.w / a.n <= b.w / b.n) break;
      blocks.splice(blocks.length - 2, 2, { ks: [...a.ks, ...b.ks], w: a.w + b.w, n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => b.ks.map((k) => ({ lo: k / 100, rate: b.w / b.n, n: b.n })));
}

/**
 * The threshold is the lowest chance at which the pick AT the threshold
 * landed `marginal` (isotonic fit, blocks of `minBlock`+ games only), so no
 * pick inside the rule is expected to land below it. `record` is the band's
 * hit rate pulled toward `marginal` by `prior` pseudo-picks.
 */
export function deriveMarginal(rs: readonly Rec[], markets: readonly string[], marginal: number, minN = 100, minBlock = 40, prior = 0): SweetSpot[] {
  const out: SweetSpot[] = [];
  for (const market of markets) {
    const obs = observations(rs, market);
    const first = isotonic(obs).find((b) => b.rate >= marginal && b.n >= minBlock);
    if (!first) continue;
    const sel = obs.filter((x) => x.p >= first.lo - 1e-9 && x.p <= CAP);
    if (sel.length < minN) continue;
    const wins = sel.filter((x) => x.win).length;
    out.push({ market, min: first.lo, record: (wins + prior * marginal) / (sel.length + prior) });
  }
  return out;
}

/**
 * Graded bands: every market gets a row for each step of its isotonic fit
 * that landed `floor` or better, so a game is rated by where in the band its
 * chance sits rather than by the band's average. Same shape as SWEET_SPOTS,
 * so sweetSpotPick runs it unchanged (the highest row that applies wins).
 */
export function bands(rs: readonly Rec[], markets: readonly string[], floor: number, minBlock = 40): SweetSpot[] {
  const out: SweetSpot[] = [];
  for (const market of markets) {
    let last = -1;
    for (const b of isotonic(observations(rs, market))) {
      if (b.rate < floor || b.n < minBlock || b.rate === last) continue;
      out.push({ market, min: b.lo, record: Math.round(b.rate * 1000) / 1000 });
      last = b.rate;
    }
  }
  return out;
}

export interface Chosen { market: string; p: number; win: boolean | null; sweet: boolean }

function settle(market: string, r: Rec): boolean | null {
  const o = evaluatePick(market, r.hg, r.ag);
  return o === "win" ? true : o === "lose" ? false : null;
}

function ranker(r: Rec): Chosen | null {
  if (!r.pick) return null;
  const o = r.pick.outcome;
  return { market: r.pick.market, p: r.pick.prob, win: o === "win" ? true : o === "lose" ? false : null, sweet: false };
}

/** As sweetSpotPick: the strongest record among rules that apply, else the ranker's pick. */
export function chooseByTable(r: Rec, rules: readonly SweetSpot[]): Chosen | null {
  let best: { rule: SweetSpot; p: number } | null = null;
  for (const rule of rules) {
    const p = chance(rule.market, r);
    if (p === null || p < rule.min || p > CAP) continue;
    if (!best || rule.record > best.rule.record || (rule.record === best.rule.record && p > best.p)) best = { rule, p };
  }
  return best ? { market: best.rule.market, p: best.p, win: settle(best.rule.market, r), sweet: true } : ranker(r);
}

type Curve = Map<string, { lo: number; rate: number; n: number }[]>;

/** No table: the candidate with the highest calibrated chance, when it clears `floor`. */
function chooseCalibrated(r: Rec, curves: Curve, floor: number, minBlock = 40): Chosen | null {
  let best: { market: string; p: number; c: number } | null = null;
  for (const [market, curve] of curves) {
    const p = chance(market, r);
    if (p === null || p < 0.5 || p > CAP) continue;
    const k = Math.min(Math.round(CAP * 100) - 1, Math.floor(p * 100 + 1e-9)) / 100;
    const b = curve.find((x) => Math.abs(x.lo - k) < 1e-9);
    if (!b || b.n < minBlock || b.rate < floor) continue;
    const over = market.startsWith("ou:over") ? 1e-6 : 0; // level: the over
    if (!best || b.rate + over > best.c) best = { market, p, c: b.rate + over };
  }
  return best ? { market: best.market, p: best.p, win: settle(best.market, r), sweet: true } : ranker(r);
}


/** Runs an arm month by month: `prepare` sees only games before the month. */
function walk<S>(all: Rec[], scoreFrom: number, trailDays: number, prepare: (before: Rec[]) => S, pick: (r: Rec, s: S) => Chosen | null, log?: (month: string, s: S) => void): Map<Rec, Chosen | null> {
  const out = new Map<Rec, Chosen | null>();
  const sorted = [...all].sort((a, b) => a.date - b.date);
  let m = new Date(scoreFrom);
  while (m.getTime() < T("2026-11-01")) {
    const start = m.getTime();
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const before = sorted.filter((r) => r.date < start && r.date >= start - trailDays * DAY);
    const s = prepare(before);
    log?.(m.toISOString().slice(0, 7), s);
    for (const r of sorted) if (r.date >= start && r.date < next.getTime()) out.set(r, pick(r, s));
    m = next;
  }
  return out;
}

interface Summary { n: number; hit: number; stated: number; sweet: number; sweetHit: number; over: number; odds: number; fairN: number; fairEdge: number }

function summarise(rs: Rec[], picks: Map<Rec, Chosen | null>): Summary {
  let n = 0, w = 0, st = 0, sn = 0, sw = 0, ov = 0, od = 0, fn = 0, fe = 0;
  for (const r of rs) {
    const c = picks.get(r);
    if (!c || c.win === null) continue;
    n++;
    st += c.p;
    od += 1 / c.p;
    if (c.win) w++;
    if (c.sweet) { sn++; if (c.win) sw++; }
    if (c.market.startsWith("ou:over")) ov++;
    const f = marketFair(c.market, r);
    if (f !== null) { fn++; fe += (c.win ? 1 : 0) - f; }
  }
  return { n, hit: w / n, stated: st / n, sweet: sn / n, sweetHit: sw / Math.max(1, sn), over: ov / n, odds: od / n, fairN: fn, fairEdge: fe / Math.max(1, fn) };
}

function hitOf(rs: Rec[], picks: Map<Rec, Chosen | null>): number {
  let n = 0, w = 0;
  for (const r of rs) {
    const c = picks.get(r);
    if (!c || c.win === null) continue;
    n++;
    if (c.win) w++;
  }
  return w / Math.max(1, n);
}

/** 95% interval of an arm's hit rate minus the base arm's, games resampled together. */
function pairedInterval(rs: Rec[], a: Map<Rec, Chosen | null>, base: Map<Rec, Chosen | null>): [number, number] {
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const diffs: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    const sample = Array.from({ length: rs.length }, () => rs[Math.floor(rnd() * rs.length)]);
    diffs.push(hitOf(sample, a) - hitOf(sample, base));
  }
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(BOOT * 0.025)], diffs[Math.floor(BOOT * 0.975)]];
}

const pc = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}`;
const table = (rules: readonly SweetSpot[]) => [...rules].sort((a, b) => b.record - a.record).map((r) => `${r.market}>=${r.min.toFixed(2)}(${r.record.toFixed(3)})`).join("  ");

function main() {
  const read = (c: string) => JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), "utf8")) as Rec[];
  const main = read(arg("cfg") ?? "ns_v3");
  const pre = arg("pre") === "none" ? [] : read(arg("pre") ?? "ns_v3_pre");
  const all = [...pre, ...main];
  const from = T("2023-08-01");
  // --emit=<json>: write the graded bands fitted on every game before --until, for audit-eval.ts --rules and for the shipped table.
  if (arg("emit")) {
    const until = T(arg("until") ?? "2026-11-01");
    const rules = bands(all.filter((r) => r.date < until), BASE_MARKETS, Number(arg("floor") ?? 0.76), Number(arg("block") ?? 100));
    fs.writeFileSync(arg("emit")!, JSON.stringify(rules));
    console.log(`${rules.length} rows from ${all.filter((r) => r.date < until).length} games before ${arg("until") ?? "2026-11-01"}`);
    for (const m of BASE_MARKETS) console.log(`  ${m.padEnd(14)} ${rules.filter((r) => r.market === m).map((r) => `${r.min.toFixed(2)}:${r.record.toFixed(3)}`).join("  ")}`);
    return;
  }
  const only = arg("arms")?.split(",");
  console.log(`${main.length} games scored, ${pre.length} earlier games for fitting; cap ${CAP}`);

  const arms: [string, Map<Rec, Chosen | null>][] = [];
  const add = (name: string, build: () => Map<Rec, Chosen | null>) => {
    if (!only || name === "ranker" || name === "shipped" || only.some((o) => name.startsWith(o))) arms.push([name, build()]);
  };
  const lastTable = new Map<string, string>();
  const tableArm = (name: string, trail: number, derive: (before: Rec[]) => SweetSpot[]) =>
    add(name, () => walk(all, from, trail, derive, chooseByTable, (_m, s) => lastTable.set(name, table(s))));

  add("ranker", () => new Map(main.map((r) => [r, ranker(r)])));
  add("shipped", () => new Map(main.map((r) => [r, chooseByTable(r, SHIPPED)])));
  const set = arg("set") ?? "1";
  if (set === "1") {
    for (const trail of [730, 1095]) {
      for (const target of [0.8, 0.82, 0.84]) tableArm(`refit t${target} ${trail}d`, trail, (b) => deriveBand(b, BASE_MARKETS, target));
      for (const m of [0.74, 0.76, 0.78, 0.8]) tableArm(`marginal m${m} ${trail}d`, trail, (b) => deriveMarginal(b, BASE_MARKETS, m));
      for (const m of [0.76, 0.78]) tableArm(`marginal m${m} ${trail}d shrunk`, trail, (b) => deriveMarginal(b, BASE_MARKETS, m, 100, 40, 300));
      for (const m of [0.76, 0.78]) tableArm(`marginal-wide m${m} ${trail}d`, trail, (b) => deriveMarginal(b, WIDE_MARKETS, m));
      for (const floor of [0.76, 0.78, 0.8]) {
        for (const [tag, mk] of [["", BASE_MARKETS], ["-wide", WIDE_MARKETS]] as const)
          add(`calibrated${tag} f${floor} ${trail}d`, () => walk(all, from, trail, (b) => new Map(mk.map((m) => [m, isotonic(observations(b, m))])) as Curve, (r, s) => chooseCalibrated(r, s, floor)));
      }
    }
  } else {
    // The price control: today's table with every threshold lowered, which also trades price for hit rate.
    for (const d of [0.02, 0.04, 0.06]) add(`shipped mins -${d}`, () => new Map(main.map((r) => [r, chooseByTable(r, SHIPPED.map((x) => ({ ...x, min: x.min - d })))])));
    for (const floor of [0.72, 0.74, 0.76, 0.78, 0.8]) tableArm(`bands f${floor} 1095d`, 1095, (b) => bands(b, BASE_MARKETS, floor));
    for (const blk of [100, 200]) tableArm(`bands f0.76 1095d blk${blk}`, 1095, (b) => bands(b, BASE_MARKETS, 0.76, blk));
    tableArm(`bands f0.76 all`, 5000, (b) => bands(b, BASE_MARKETS, 0.76));
    tableArm(`bands f0.78 all`, 5000, (b) => bands(b, BASE_MARKETS, 0.78));
    // Fitted once and left alone: on everything before the cut (windows before it are in sample).
    for (const cut of ["2024-07-01", "2025-07-01"]) {
      const before = all.filter((r) => r.date < T(cut));
      for (const floor of [0.76, 0.78]) {
        const fixed = bands(before, BASE_MARKETS, floor);
        add(`bands f${floor} fixed<${cut}`, () => new Map(main.map((r) => [r, chooseByTable(r, fixed)])));
        lastTable.set(`bands f${floor} fixed<${cut}`, table(fixed));
      }
    }
  }

  const base = arms.find(([n]) => n === "shipped")![1];
  for (const [wn, a, b] of WINDOWS) {
    const rs = main.filter((r) => r.date >= a && r.date < b);
    console.log(`\n== ${wn} (${rs.length} games) ==`);
    console.log(`${"arm".padEnd(34)} ${"n".padStart(5)}  hit     vs shipped (95%)          stated  rule share (hit)   overs  avg fair odds  result picks vs closing fair`);
    for (const [name, picks] of arms) {
      const s = summarise(rs, picks);
      const d = s.hit - hitOf(rs, base);
      const ci = name === "shipped" ? null : pairedInterval(rs, picks, base);
      console.log(
        `${name.padEnd(34)} ${String(s.n).padStart(5)}  ${pc(s.hit)}  ${ci ? `${pp(d)} (${pp(ci[0])}, ${pp(ci[1])})`.padEnd(24) : "".padEnd(24)}  ${pc(s.stated)}   ${pc(s.sweet, 0).padStart(4)} (${pc(s.sweetHit)})      ${pc(s.over, 0).padStart(4)}   ${s.odds.toFixed(3)}          ${pp(s.fairEdge)} on ${s.fairN}`,
      );
    }
  }
  console.log(`\nshipped: ${table(SHIPPED)}`);
  for (const [name, t] of lastTable) console.log(`${name} (Oct 2026 table): ${t}`);
}

if (process.argv[1]?.endsWith("sweet-lab.ts")) main();
