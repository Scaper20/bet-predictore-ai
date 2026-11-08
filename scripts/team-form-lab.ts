/**
 * Research only: can the Code Hub do better by favouring games whose teams
 * have been landing our picks?
 *
 * Walk-forward over three years (stops at the frozen holdout unless --final),
 * the production hub rebuilt each day (scripts/lib/hub-walk.ts). A team's
 * record on a day is built ONLY from the published pick (the model's headline
 * pick) on its games settled before that day: how often it landed, and how far
 * above or below its stated chance.
 *
 *   A. evidence     every game's strongest hub leg, grouped by its two teams'
 *                   recent record: does a hot pair beat the stated chance, in
 *                   each year on its own? Plus a regression of the outcome on
 *                   the stated chance and the team record, so the record's
 *                   effect is measured beyond what the model already said.
 *   B. hub          the hub rebuilt with legs preferred, or only allowed, by
 *                   their teams' record, against the hub as it is, day by day
 *                   on the same games. Differences come with a 95% interval
 *                   from resampling the days (paired), per year and on the
 *                   owner's Sep-Oct 2026 window.
 *
 *   npx tsx scripts/team-form-lab.ts
 *   npx tsx scripts/team-form-lab.ts --years=3
 */

import type { PoolEntry } from "../src/lib/forge";
import { buildHub, hubMarketAllowed, hubTier } from "../src/lib/code-hub";
import { arg, candidates, closingPrice, DAY, DIVS, load, walk, won, type Graded } from "./lib/hub-walk";

/* ---------------------------------------------------------- team record */

interface Entry {
  day: number;
  won: number;
  p: number;
}

const TEAM_LOG = new Map<string, Entry[]>();

function buildTeamLog(all: Graded[]) {
  for (const g of all) {
    const pk = g.p.topPick;
    if (!pk || pk.market === "locked") continue;
    const r = won(pk.market, g.row);
    if (r === "push" || r === null) continue;
    for (const t of [g.row.home, g.row.away]) {
      const k = `${g.code}|${t}`;
      const xs = TEAM_LOG.get(k) ?? [];
      xs.push({ day: g.day, won: r === "win" ? 1 : 0, p: pk.probability });
      TEAM_LOG.set(k, xs);
    }
  }
}

interface TeamRecord {
  n: number;
  hit: number;
  gap: number;
}

/** A team's last `n` published picks before `day`. */
function record(code: string, team: string, day: number, n: number): TeamRecord | null {
  const xs = TEAM_LOG.get(`${code}|${team}`) ?? [];
  let hi = xs.length;
  while (hi > 0 && xs[hi - 1].day >= day) hi--;
  const last = xs.slice(Math.max(0, hi - n), hi);
  if (last.length < Math.ceil(n / 2)) return null;
  const hit = last.reduce((a, x) => a + x.won, 0) / last.length;
  return { n: last.length, hit, gap: hit - last.reduce((a, x) => a + x.p, 0) / last.length };
}

/** Both teams' records, or null when either has too few picks yet. */
function pair(g: Graded, day: number, n = 8): { home: TeamRecord; away: TeamRecord; hit: number; gap: number; min: number } | null {
  const home = record(g.code, g.row.home, day, n);
  const away = record(g.code, g.row.away, day, n);
  if (!home || !away) return null;
  return { home, away, hit: (home.hit + away.hit) / 2, gap: (home.gap + away.gap) / 2, min: Math.min(home.hit, away.hit) };
}

/* ------------------------------------------------------------- windows */

interface Window {
  name: string;
  from: number;
  to: number;
}

function windows(end: number, years: number): Window[] {
  const out: Window[] = [];
  for (let y = years; y >= 1; y--) {
    const from = end - y * 365 * DAY;
    out.push({ name: `year to ${new Date(from + 365 * DAY).toISOString().slice(0, 7)}`, from, to: from + 365 * DAY });
  }
  out.push({ name: `all ${years} years`, from: end - years * 365 * DAY, to: end });
  out.push({ name: "owner Sep-Oct 2026", from: Date.parse("2026-09-01"), to: end });
  return out;
}

/* ------------------------------------------------------------ A. evidence */

function logit(p: number) {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
}

/**
 * Logistic regression y ~ a + b*logit(p) + c*x by Newton's method; returns c
 * and its standard error. c > 0 with |c/se| > 2 means the team record says
 * something the stated chance does not.
 */
function regress(rows: { y: number; p: number; x: number }[]): { c: number; se: number } {
  let w = [0, 1, 0];
  for (let it = 0; it < 25; it++) {
    const g = [0, 0, 0];
    const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const r of rows) {
      const f = [1, logit(r.p), r.x];
      const z = w[0] * f[0] + w[1] * f[1] + w[2] * f[2];
      const m = 1 / (1 + Math.exp(-z));
      for (let i = 0; i < 3; i++) {
        g[i] += (r.y - m) * f[i];
        for (let j = 0; j < 3; j++) H[i][j] += m * (1 - m) * f[i] * f[j];
      }
    }
    const inv = invert3(H);
    const step = [0, 1, 2].map((i) => inv[i][0] * g[0] + inv[i][1] * g[1] + inv[i][2] * g[2]);
    w = w.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) {
      return { c: w[2], se: Math.sqrt(inv[2][2]) };
    }
  }
  return { c: w[2], se: NaN };
}

function invert3(m: number[][]): number[][] {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

/** The same regression on the published pick itself (the headline), where the earlier block test saw a lift. */
function evidenceHeadline(all: Graded[], wins: Window[]) {
  console.log("\nA2. THE PUBLISHED PICK ITSELF, by its two teams' last-8 record");
  const legs: { day: number; y: number; p: number; hit: number; gap: number; min: number }[] = [];
  for (const g of all) {
    const pk = g.p.topPick;
    if (!pk || pk.market === "locked") continue;
    const r = won(pk.market, g.row);
    if (r === "push" || r === null) continue;
    const pr = pair(g, g.day);
    if (!pr) continue;
    legs.push({ day: g.day, y: r === "win" ? 1 : 0, p: pk.probability, hit: pr.hit, gap: pr.gap, min: pr.min });
  }
  for (const w of wins) {
    const ls = legs.filter((l) => l.day >= w.from && l.day < w.to);
    const part = (f: (l: (typeof ls)[number]) => boolean) => {
      const b = ls.filter(f);
      const hit = b.reduce((a, l) => a + l.y, 0) / Math.max(1, b.length);
      const st = b.reduce((a, l) => a + l.p, 0) / Math.max(1, b.length);
      return `${String(b.length).padStart(5)} ${(100 * hit).toFixed(1)}%/${(100 * st).toFixed(1)}%`;
    };
    const rh = regress(ls.map((l) => ({ y: l.y, p: l.p, x: l.hit - 0.75 })));
    const rg = regress(ls.map((l) => ({ y: l.y, p: l.p, x: l.gap })));
    console.log(
      `  ${w.name.padEnd(20)} hot pair ${part((l) => l.min >= 0.875)}  avg 75%+ ${part((l) => l.hit >= 0.75 && l.min < 0.875)}  under 75% ${part((l) => l.hit < 0.75)}` +
        `   beyond stated: how often z=${(rh.c / rh.se).toFixed(1)}, minus stated z=${(rg.c / rg.se).toFixed(1)}`,
    );
  }
}

function evidence(all: Graded[], wins: Window[]) {
  console.log("\nA. EVIDENCE: each game's strongest hub leg, by its two teams' record over their last 8 published picks");
  type Leg = { day: number; y: number; p: number; hit: number | null; gap: number | null; min: number | null };
  const legs: Leg[] = [];
  for (const g of all) {
    const cs = candidates(g);
    if (!cs.length) continue;
    const best = cs.reduce((a, b) => (b.probability > a.probability ? b : a));
    const r = won(best.market, g.row);
    if (r === "push" || r === null) continue;
    const pr = pair(g, g.day);
    legs.push({ day: g.day, y: r === "win" ? 1 : 0, p: best.probability, hit: pr?.hit ?? null, gap: pr?.gap ?? null, min: pr?.min ?? null });
  }
  const buckets: [string, (l: Leg) => boolean][] = [
    ["both teams 7/8+ (hot pair)", (l) => l.min !== null && l.min >= 0.875],
    ["average 75%+", (l) => l.hit !== null && l.hit >= 0.75 && !(l.min !== null && l.min >= 0.875)],
    ["average 50-74%", (l) => l.hit !== null && l.hit >= 0.5 && l.hit < 0.75],
    ["average under 50%", (l) => l.hit !== null && l.hit < 0.5],
    ["a team with too few picks", (l) => l.hit === null],
  ];
  for (const w of wins) {
    const ls = legs.filter((l) => l.day >= w.from && l.day < w.to);
    console.log(`\n  ${w.name}: ${ls.length} legs`);
    for (const [name, f] of buckets) {
      const b = ls.filter(f);
      if (!b.length) continue;
      const hit = b.reduce((a, l) => a + l.y, 0) / b.length;
      const st = b.reduce((a, l) => a + l.p, 0) / b.length;
      const se = Math.sqrt((hit * (1 - hit)) / b.length);
      console.log(
        `    ${name.padEnd(28)} ${String(b.length).padStart(5)}  landed ${(100 * hit).toFixed(1).padStart(5)}%  stated ${(100 * st).toFixed(1).padStart(5)}%  gap ${((hit - st) * 100 >= 0 ? "+" : "") + ((hit - st) * 100).toFixed(1).padStart(4)} ±${(196 * se).toFixed(1)}`,
      );
    }
    const known = ls.filter((l) => l.hit !== null);
    const rh = regress(known.map((l) => ({ y: l.y, p: l.p, x: l.hit! - 0.75 })));
    const rg = regress(known.map((l) => ({ y: l.y, p: l.p, x: l.gap! })));
    // What the fitted effect means at a 75% leg: a pair one pick in eight better.
    const at = (c: number) => 100 * (1 / (1 + Math.exp(-(logit(0.75) + c * 0.125))) - 0.75);
    console.log(
      `    beyond the stated chance: how often they land  z=${(rh.c / rh.se).toFixed(1).padStart(4)} (one pick in 8 better = ${at(rh.c) >= 0 ? "+" : ""}${at(rh.c).toFixed(1)}pt);` +
        `  landed minus stated  z=${(rg.c / rg.se).toFixed(1).padStart(4)} (${at(rg.c) >= 0 ? "+" : ""}${at(rg.c).toFixed(1)}pt)`,
    );
  }
}

/* ----------------------------------------------------------------- B. hub */

interface Variant {
  name: string;
  /** Games allowed into the pool; absent keeps every game. */
  keep?: (g: Graded, day: number) => boolean;
  /** Added to a leg's chance for choosing only (codes are graded on the real result). */
  mark?: (g: Graded, day: number) => number;
}

const VARIANTS: Variant[] = [
  { name: "hub as it is" },
  { name: "prefer: landed-minus-stated, last 8, x0.5", mark: (g, d) => 0.5 * (pair(g, d)?.gap ?? 0) },
  { name: "prefer: landed-minus-stated, last 8, x1", mark: (g, d) => pair(g, d)?.gap ?? 0 },
  { name: "prefer: landed-minus-stated, last 8, x2", mark: (g, d) => 2 * (pair(g, d)?.gap ?? 0) },
  { name: "prefer: landed-minus-stated, last 6, x1", mark: (g, d) => pair(g, d, 6)?.gap ?? 0 },
  { name: "prefer: landed-minus-stated, last 12, x1", mark: (g, d) => pair(g, d, 12)?.gap ?? 0 },
  { name: "prefer: how often they land, last 8, x0.25", mark: (g, d) => { const p = pair(g, d); return p ? 0.25 * (p.hit - 0.76) : 0; } },
  { name: "prefer: how often they land, last 8, x0.5", mark: (g, d) => { const p = pair(g, d); return p ? 0.5 * (p.hit - 0.76) : 0; } },
  { name: "prefer: +4pt when both teams 7/8+", mark: (g, d) => ((pair(g, d)?.min ?? 0) >= 0.875 ? 0.04 : 0) },
  { name: "prefer: +8pt when both teams 7/8+", mark: (g, d) => ((pair(g, d)?.min ?? 0) >= 0.875 ? 0.08 : 0) },
  { name: "only: teams averaging 75%+ (last 8)", keep: (g, d) => (pair(g, d)?.hit ?? 0) >= 0.75 },
  { name: "only: teams averaging 75%+, or too few picks", keep: (g, d) => { const p = pair(g, d); return !p || p.hit >= 0.75; } },
  { name: "drop: a team landing under 50% (last 8)", keep: (g, d) => { const p = pair(g, d); return !p || p.min >= 0.5; } },
];

interface DayResult {
  codes: number;
  landed: number;
  expected: number;
  profit: number;
  any: number;
}

function replay(byDay: Map<number, Graded[]>, rows: Map<string, Graded["row"]>, v: Variant): Map<number, DayResult> {
  const out = new Map<number, DayResult>();
  for (const [day, games] of byDay) {
    const pool: PoolEntry[] = [];
    const real = new Map<string, number>();
    for (const g of games) {
      if (v.keep && !v.keep(g, day)) continue;
      const adj = v.mark?.(g, day) ?? 0;
      const cs = candidates(g);
      for (const c of cs) real.set(`${g.p.match.id}|${c.market}`, c.probability);
      const marked = cs.map((c) => ({ ...c, probability: Math.min(0.99, c.probability + adj) }));
      if (marked.length) pool.push({ prediction: g.p, candidates: marked });
    }
    const daily = buildHub(pool, String(day), pool, hubMarketAllowed).filter((c) => hubTier(c.tier)!.days === 1);
    const r: DayResult = { codes: 0, landed: 0, expected: 0, profit: 0, any: 0 };
    for (const c of daily) {
      r.codes++;
      r.expected += c.legs.reduce((a, l) => a * (real.get(`${l.matchId}|${l.market}`) ?? l.probability), 1);
      const landed = c.legs.every((l) => {
        const x = won(l.market, rows.get(l.matchId)!);
        return x === "win" || x === "push";
      });
      const load = c.legs.reduce((a, l) => a * (closingPrice(l.market, rows.get(l.matchId)!) ?? l.fairOdds / 1.07), 1);
      r.profit += landed ? load - 1 : -1;
      if (landed) {
        r.landed++;
        r.any = 1;
      }
    }
    out.set(day, r);
  }
  return out;
}

/** Seeded generator so the intervals reproduce. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Mean paired difference per 100 days and its 95% interval, resampling days. */
function paired(days: number[], a: Map<number, DayResult>, b: Map<number, DayResult>, f: (r: DayResult) => number) {
  const d = days.map((x) => f(b.get(x)!) - f(a.get(x)!));
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  const rand = rng(7);
  const boots: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let s = 0;
    for (let j = 0; j < d.length; j++) s += d[Math.floor(rand() * d.length)];
    boots.push(s / d.length);
  }
  boots.sort((x, y) => x - y);
  return { mean: 100 * mean, lo: 100 * boots[49], hi: 100 * boots[1949] };
}

function hub(all: Graded[], wins: Window[]) {
  console.log("\nB. CODE HUB, DAILY CODES (2, 3, 5, 10, 20): each variant against the hub as it is, same days");
  const byDay = new Map<number, Graded[]>();
  for (const g of all) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g]);
  const rows = new Map(all.map((g) => [g.p.match.id, g.row]));
  const results = VARIANTS.map((v) => {
    process.stderr.write(`  ${v.name}\n`);
    return replay(byDay, rows, v);
  });
  const base = results[0];
  const fmt = (x: { mean: number; lo: number; hi: number }, dp = 1) =>
    `${x.mean >= 0 ? "+" : ""}${x.mean.toFixed(dp)} [${x.lo.toFixed(dp)}, ${x.hi.toFixed(dp)}]`;
  for (const w of wins) {
    const days = [...byDay.keys()].filter((d) => d >= w.from && d < w.to && (base.get(d)!.codes > 0 || results.some((r) => r.get(d)!.codes > 0)));
    console.log(`\n  ${w.name}: ${days.length} days with codes`);
    console.log(`    ${"variant".padEnd(46)} codes  landed (exp)   any-landed days  return   landed codes /100 days vs now   profit units /100 days vs now`);
    VARIANTS.forEach((v, i) => {
      const r = results[i];
      let codes = 0, landed = 0, exp = 0, profit = 0, any = 0;
      for (const d of days) {
        const x = r.get(d)!;
        codes += x.codes;
        landed += x.landed;
        exp += x.expected;
        profit += x.profit;
        any += x.any;
      }
      const dl = i ? fmt(paired(days, base, r, (x) => x.landed)) : "";
      const dp = i ? fmt(paired(days, base, r, (x) => x.profit), 0) : "";
      console.log(
        `    ${v.name.padEnd(46)} ${String(codes).padStart(5)}  ${String(landed).padStart(4)} (${exp.toFixed(0).padStart(4)})  ${((100 * any) / days.length).toFixed(0).padStart(5)}%          ${((100 * profit) / Math.max(1, codes)).toFixed(1).padStart(6)}%   ${dl.padEnd(30)}  ${dp}`,
      );
    });
  }
}

async function main() {
  const years = Number(arg("years") ?? 3);
  const all: Graded[] = [];
  for (const d of DIVS) {
    process.stderr.write(`${d.div}… `);
    // 120 days more than the replay, so every team has a record from the first day.
    all.push(...walk(d, await load(d.div), years * 365 + 120));
  }
  all.sort((a, b) => a.day - b.day);
  process.stderr.write(`\n${all.length} publishable fixtures\n`);
  buildTeamLog(all);
  const end = all[all.length - 1].day + DAY;
  const wins = windows(end, years);
  evidence(all, wins);
  evidenceHeadline(all, wins);
  if (process.argv.includes("--evidence-only")) return;
  hub(all, wins);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
