/**
 * Corners (and optionally shots / shots on target) picks, walk-forward, by side.
 *
 * Replays every selection the count model prices (match-stats.ts statSelections)
 * for each fixture in 17 divisions, fitting only on matches before its
 * matchday, then answers three questions:
 *   1. Are overs or unders the better-calibrated side? (claimed vs landed,
 *      by line family and stated-chance band)
 *   2. How does the shipped corners rule (corners:under:12.5 at 82%+) hold up?
 *   3. Which selections qualify under the sweet-spot procedure (lowest chance
 *      where hits reach TARGET, 100+ picks) when derived on 2022-25 and scored
 *      on 2025-26 and on Sep-Oct 2026? Overs included.
 *
 *   npx tsx scripts/audit-corners.ts [--stat=corners|shots|sot] [--target=0.82]
 *
 * Stops at 31 Oct 2026 (frozen holdout, scripts/lib/holdout.ts).
 */

import { expectStat, fitStat, statGrid, statMarkets, statSelections, STAT_LINES, STAT_OPTIONS, type StatKind, type StatSample } from "../src/lib/model/match-stats";
import fs from "node:fs";
import { csv, parse, type Row } from "./lib/football-data-uk";
import { TUNING_END } from "./lib/holdout";
import { DIVS } from "./audit-eval";

const DAY = 86_400_000;
const TRAIN_DAYS = 1000;
const SEASONS = ["1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"];
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const STAT = (arg("stat") ?? "corners") as "corners" | "shots" | "sot";
const KIND: StatKind = STAT === "sot" ? "shotsOnTarget" : STAT;
const TARGET = Number(arg("target") ?? 0.82);
const T = (s: string) => Date.parse(s);
const WIN = {
  derive: [T("2022-08-01"), T("2025-07-01")] as [number, number],
  held: [T("2025-07-01"), T("2026-07-01")] as [number, number],
  owner: [T("2026-09-01"), T("2026-11-01")] as [number, number],
};
const END = T(TUNING_END) + DAY;
/** LEVEL="60:0.5": scale expected counts by recent (half-life days) over the fit's own level, `weight` of the gap, within +-10%. */
const LEVEL = process.env.LEVEL ? process.env.LEVEL.split(":").map(Number) : null;

interface Rec {
  date: number;
  div: string;
  h: number;
  a: number;
  p: Record<string, number>;
}

const pick = (r: Row): [number, number] =>
  KIND === "corners" ? r.stats!.corners : KIND === "shots" ? r.stats!.shots : r.stats!.shotsOnTarget;

/** Outcome of a selection key against the counts; null when it pushes (whole line). */
function won(market: string, h: number, a: number): boolean | null {
  const [, x, y, z] = market.split(":");
  const vs = (n: number, line: number, over: boolean) => (n === line ? null : (n > line) === over);
  if (x === "over" || x === "under") return vs(h + a, Number(y), x === "over");
  if ((x === "home" || x === "away") && (y === "over" || y === "under")) return vs(x === "home" ? h : a, Number(z), y === "over");
  if (x === "most") {
    if (y === "home") return h > a;
    if (y === "away") return a > h;
    if (y === "home-or-level") return h >= a;
    if (y === "away-or-level") return a >= h;
  }
  return null;
}

async function build(): Promise<Rec[]> {
  const out: Rec[] = [];
  const opts = STAT_OPTIONS[KIND];
  const lines = STAT_LINES[KIND];
  for (const d of DIVS) {
    const rows: Row[] = [];
    for (const s of SEASONS) {
      try {
        rows.push(...parse(await csv(s, d.div), d.div));
      } catch {
        // season not published
      }
    }
    rows.sort((x, y) => x.date - y.date);
    const samples: StatSample[] = rows.filter((r) => r.stats).map((r) => {
      const [h, a] = pick(r);
      return { date: r.date, home: r.home, away: r.away, h, a, referee: r.referee };
    });
    const target = samples.filter((s) => s.date >= WIN.derive[0] && s.date < END);
    let dayKey = "";
    let fit: ReturnType<typeof fitStat> | undefined;
    let nTrain = 0;
    let level = 1;
    for (const s of target) {
      const day = new Date(s.date).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        const start = Date.parse(day);
        const train = samples.filter((x) => x.date < start && x.date >= start - TRAIN_DAYS * DAY);
        nTrain = train.length;
        fit = fitStat(train, start, opts);
        level = 1;
        if (LEVEL && train.length > 0) {
          const decay = Math.log(2) / (LEVEL[0] * DAY);
          let w = 0, g = 0;
          for (const x of train) { const k = Math.exp(-decay * (start - x.date)); w += k; g += k * (x.h + x.a); }
          const ratio = g / w / Math.max(1e-9, fit.muH + fit.muA);
          level = Math.min(1.1, Math.max(0.9, 1 + LEVEL[1] * (ratio - 1)));
        }
      }
      if (!fit || nTrain < 200) continue;
      const e0 = expectStat(fit, s.home, s.away, s.referee);
      const exp = { home: e0.home * level, away: e0.away * level };
      const m = statMarkets(statGrid(exp, fit, lines.max), lines);
      const sel = statSelections(KIND, m);
      const p: Record<string, number> = {};
      for (const [k, v] of Object.entries(sel)) if (!k.includes(":hcp:")) p[k] = v;
      out.push({ date: s.date, div: d.div, h: s.h, a: s.a, p });
    }
    process.stderr.write(`${d.div}: ${out.length}\n`);
  }
  return out;
}

const inWin = (rs: Rec[], [a, b]: [number, number]) => rs.filter((r) => r.date >= a && r.date < b);
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

function family(market: string): string {
  const [, x, y] = market.split(":");
  if (x === "over" || x === "under") return `total ${x}`;
  if (x === "home" || x === "away") return `team ${y}`;
  return `most (${x}${y ? ":" + y : ""})`;
}

function calibration(rs: Rec[], label: string) {
  console.log(`\n${label}: claimed vs landed, selections stated 65%+ (pushes out)`);
  const by = new Map<string, { n: number; w: number; p: number }>();
  for (const r of rs)
    for (const [m, p] of Object.entries(r.p)) {
      if (p < 0.65) continue;
      const w = won(m, r.h, r.a);
      if (w === null) continue;
      const band = p >= 0.8 ? "80%+" : p >= 0.75 ? "75-80" : p >= 0.7 ? "70-75" : "65-70";
      for (const k of [family(m), `${family(m)} @ ${band}`]) {
        const e = by.get(k) ?? { n: 0, w: 0, p: 0 };
        e.n++; e.p += p; if (w) e.w++;
        by.set(k, e);
      }
    }
  for (const [k, e] of [...by].sort()) if (e.n >= 200) console.log(`  ${k.padEnd(34)} n=${String(e.n).padStart(6)}  claimed ${pc(e.p / e.n)}  landed ${pc(e.w / e.n)}  gap ${((e.w / e.n - e.p / e.n) * 100).toFixed(1).padStart(5)}`);
}

function derive(rs: Rec[], markets: string[]) {
  const out: { market: string; min: number; record: number }[] = [];
  for (const market of markets) {
    const rows = rs.map((r) => ({ p: r.p[market], w: won(market, r.h, r.a) })).filter((x): x is { p: number; w: boolean } => x.p !== undefined && x.w !== null);
    for (let t = 0.6; t <= 0.85 + 1e-9; t += 0.01) {
      const sel = rows.filter((x) => x.p >= t - 1e-9 && x.p <= 0.85);
      if (sel.length < 100) break;
      const hit = sel.filter((x) => x.w).length / sel.length;
      if (hit >= TARGET) {
        out.push({ market, min: Math.round(t * 100) / 100, record: hit });
        break;
      }
    }
  }
  return out.sort((a, b) => b.record - a.record);
}

function applyRule(rs: Rec[], market: string, min: number) {
  let n = 0, w = 0, p = 0;
  for (const r of rs) {
    const q = r.p[market];
    if (q === undefined || q < min - 1e-9 || q > 0.85) continue;
    const o = won(market, r.h, r.a);
    if (o === null) continue;
    n++; p += q; if (o) w++;
  }
  return { n, hit: n ? w / n : NaN, stated: n ? p / n : NaN };
}

/**
 * One count-market pick per fixture under a policy: the likeliest selection
 * between `lo` and the 85% cap (as the board substitution ranks them, minus the
 * SportyBet half), after `haircut` is taken off every over and `tilt` added to
 * every over. Pushes drop out. Returns per-window hit rates.
 */
function policy(rs: Rec[], opts: { haircut?: number; tilt?: number; only?: "over" | "under"; lo?: number; families?: "total" | "team" | "both" }) {
  const lo = opts.lo ?? 0.8;
  const out = { n: 0, w: 0, p: 0, overs: 0, overW: 0 };
  for (const r of rs) {
    let best: { m: string; q: number; eff: number } | null = null;
    for (const [m, q0] of Object.entries(r.p)) {
      if (m.includes(":most:")) continue;
      const parts = m.split(":");
      const isTotal = parts[1] === "over" || parts[1] === "under";
      if (opts.families === "total" && !isTotal) continue;
      if (opts.families === "team" && isTotal) continue;
      const side = isTotal ? parts[1] : parts[2];
      if (opts.only && side !== opts.only) continue;
      const q = side === "over" ? q0 - (opts.haircut ?? 0) : q0;
      if (q < lo || q > 0.85) continue;
      const eff = q + (side === "over" ? opts.tilt ?? 0 : 0);
      if (!best || eff > best.eff) best = { m, q, eff };
    }
    if (!best) continue;
    const w = won(best.m, r.h, r.a);
    if (w === null) continue;
    out.n++; out.p += best.q; if (w) out.w++;
    if (best.m.split(":")[1] === "over" || best.m.split(":")[2] === "over") { out.overs++; if (w) out.overW++; }
  }
  return out;
}

async function main() {
  const cache = process.env.CORNERS_CACHE ? `${process.env.CORNERS_CACHE}/${STAT}.json` : null;
  const rs: Rec[] = cache && fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, "utf8")) : await build();
  if (cache && !fs.existsSync(cache)) fs.writeFileSync(cache, JSON.stringify(rs));
  const dev = inWin(rs, WIN.derive), held = inWin(rs, WIN.held), owner = inWin(rs, WIN.owner);
  console.log(`${STAT}: ${dev.length} derive, ${held.length} held-out, ${owner.length} owner fixtures (counts available)`);
  calibration(dev, "2022-08 to 2025-06");
  calibration(held, "held-out 2025-26");
  calibration(owner, "owner Sep-Oct 2026");

  const markets = Object.keys(rs[0].p).filter((m) => !m.includes(":most:"));
  const rules = derive(dev, markets);
  console.log(`\nrules found on 2022-25 (lowest chance reaching ${TARGET}, 100+ picks, cap 85%):`);
  for (const r of rules.slice(0, 14)) {
    const h = applyRule(held, r.market, r.min), o = applyRule(owner, r.market, r.min);
    console.log(`  ${r.market.padEnd(26)} >= ${r.min.toFixed(2)} derive ${pc(r.record)}   held-out n=${String(h.n).padStart(5)} hit ${pc(h.hit)} (stated ${pc(h.stated)})   owner n=${String(o.n).padStart(4)} hit ${pc(o.hit)}`);
  }
  const overs = rules.filter((r) => r.market.includes(":over:"));
  console.log(`\noverlay: ${overs.length} of ${rules.length} qualifying selections are overs`);
  console.log(`\npick policies: one ${STAT} pick per fixture, likeliest selection in 80-85% (hit / n / share of picks that are overs)`);
  const pols: [string, Parameters<typeof policy>[1]][] = [
    ["as priced", {}],
    ["overs only", { only: "over" }],
    ["unders only", { only: "under" }],
    ["lean to overs +0.02", { tilt: 0.02 }],
    ["lean to overs +0.04", { tilt: 0.04 }],
    ["overs haircut 0.015", { haircut: 0.015 }],
    ["overs haircut 0.03", { haircut: 0.03 }],
    ["totals only", { families: "total" }],
    ["team lines only", { families: "team" }],
  ];
  for (const [name, o] of pols) {
    const cells = ([["derive", dev], ["held-out", held], ["owner", owner]] as const).map(([wn, w]) => {
      const x = policy(w, o);
      return `${wn} ${pc(x.w / Math.max(1, x.n))} (${x.n}, ${pc(x.overs / Math.max(1, x.n))} overs)`;
    });
    console.log(`  ${name.padEnd(22)} ${cells.join("   ")}`);
  }
  if (STAT === "corners") {
    console.log("\nshipped rule corners:under:12.5 at 82%+:");
    for (const [n, w] of [["derive", dev], ["held-out", held], ["owner", owner]] as const) {
      const x = applyRule(w, "corners:under:12.5", 0.82);
      console.log(`  ${n.padEnd(9)} n=${String(x.n).padStart(5)} hit ${pc(x.hit)} stated ${pc(x.stated)}`);
    }
  }
}

if (process.argv[1]?.endsWith("audit-corners.ts")) void main();
