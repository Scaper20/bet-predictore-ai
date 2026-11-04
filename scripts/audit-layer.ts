/**
 * Refits the sweet-spot layer on a config's own probabilities and scores it
 * out of sample, so two probability models are compared the way the product
 * would run them: each with rules found on ITS numbers.
 *
 * Procedure (same for every config, so none is favoured):
 *   1. derive on 1 Aug 2023 - 30 Jun 2025: for each rule market, the lowest
 *      chance (0.01 steps, up to the 0.85 cap) at which the selection landed at
 *      least TARGET with 100+ picks. That is how sweet-spots.ts was built.
 *   2. score on 1 Jul 2025 - 30 Jun 2026 (held out from the derivation) and on
 *      Sep-Oct 2026 (the owner's sample), picking per game exactly as
 *      sweetSpotPick does (best record among rules that apply), falling back
 *      to the ranker's pick (audit-eval.ts --cfg=ns_*, sweet spots off).
 *
 *   npx tsx scripts/audit-layer.ts --dir=<scratch> --cfgs=ns_legacy,ns_c11 [--target=0.82]
 *
 * Stat-market rules (corners, shots) need the count model and are left out of
 * every arm alike. Whole-line handicaps over a goal are paused in production
 * (paused.ts) and so are not rules here.
 */

import fs from "node:fs";
import path from "node:path";
import { evaluatePick } from "../src/lib/settlement";
import { SWEET_SPOTS, type SweetSpot } from "../src/lib/model/sweet-spots";
import { isPausedPick } from "../src/lib/model/paused";
import type { Rec } from "./audit-eval";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const dir = arg("dir") ?? "/tmp";
const TARGET = Number(arg("target") ?? 0.82);
const CAP = 0.85;
const MIN_N = 100;
const T = (s: string) => Date.parse(s);
const DERIVE: [number, number] = [T("2023-08-01"), T("2025-07-01")];
const HELD: [number, number] = [T("2025-07-01"), T("2026-07-01")];
const OWNER: [number, number] = [T("2026-09-01"), T("2026-11-01")];

const RULE_MARKETS = SWEET_SPOTS.filter((r) => !r.market.startsWith("corners") && !isPausedPick(r.market)).map((r) => r.market);

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

const inWin = (rs: Rec[], [a, b]: [number, number]) => rs.filter((r) => r.date >= a && r.date < b);

export function derive(rs: Rec[], target = TARGET): SweetSpot[] {
  const out: SweetSpot[] = [];
  for (const market of RULE_MARKETS) {
    const rows = rs
      .map((r) => ({ p: chance(market, r), o: evaluatePick(market, r.hg, r.ag) }))
      .filter((x): x is { p: number; o: "win" | "lose" } => x.p !== null && (x.o === "win" || x.o === "lose"));
    for (let t = 0.5; t <= CAP + 1e-9; t += 0.01) {
      const sel = rows.filter((x) => x.p >= t - 1e-9 && x.p <= CAP);
      if (sel.length < MIN_N) break;
      const hit = sel.filter((x) => x.o === "win").length / sel.length;
      if (hit >= target) {
        out.push({ market, min: Math.round(t * 100) / 100, record: Math.round(hit * 1000) / 1000 });
        break;
      }
    }
  }
  return out.sort((a, b) => b.record - a.record);
}

export interface Chosen {
  win: boolean | null;
  p: number;
  sweet: boolean;
}

export function choose(r: Rec, rules: readonly SweetSpot[]): Chosen | null {
  let best: { rule: SweetSpot; p: number } | null = null;
  for (const rule of rules) {
    const p = chance(rule.market, r);
    if (p === null || p < rule.min || p > CAP) continue;
    if (!best || rule.record > best.rule.record || (rule.record === best.rule.record && p > best.p)) best = { rule, p };
  }
  if (best) {
    const o = evaluatePick(best.rule.market, r.hg, r.ag);
    return { win: o === "win" ? true : o === "lose" ? false : null, p: best.p, sweet: true };
  }
  if (!r.pick) return null;
  const o = r.pick.outcome;
  return { win: o === "win" ? true : o === "lose" ? false : null, p: r.pick.prob, sweet: false };
}

interface Score {
  n: number;
  hit: number;
  stated: number;
  sweetShare: number;
  sweetHit: number;
  restHit: number;
}

export function score(rs: Rec[], rules: readonly SweetSpot[]): Score {
  let n = 0, w = 0, st = 0, sn = 0, sw = 0, rn = 0, rw = 0;
  for (const r of rs) {
    const c = choose(r, rules);
    if (!c || c.win === null) continue;
    n++;
    st += c.p;
    if (c.win) w++;
    if (c.sweet) {
      sn++;
      if (c.win) sw++;
    } else {
      rn++;
      if (c.win) rw++;
    }
  }
  return { n, hit: w / Math.max(1, n), stated: st / Math.max(1, n), sweetShare: sn / Math.max(1, n), sweetHit: sw / Math.max(1, sn), restHit: rw / Math.max(1, rn) };
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

function main() {
  const cfgs = (arg("cfgs") ?? "ns_legacy").split(",");
  const base = JSON.parse(fs.readFileSync(path.join(dir, `${cfgs[0]}.json`), "utf8")) as Rec[];
  const data = new Map<string, Rec[]>();
  for (const c of cfgs) data.set(c, c === cfgs[0] ? base : JSON.parse(fs.readFileSync(path.join(dir, `${c}.json`), "utf8")));

  console.log(`target ${TARGET}  cap ${CAP}  min n ${MIN_N}`);
  const shipped = [...SWEET_SPOTS].filter((r) => RULE_MARKETS.includes(r.market));
  const arms: [string, string, readonly SweetSpot[]][] = [["ns_legacy", "shipped rules", shipped]];
  for (const c of cfgs) arms.push([c, "refitted rules", derive(inWin(data.get(c)!, DERIVE))]);

  for (const [c, label, rules] of arms) {
    console.log(`\n${c} / ${label}: ${rules.map((r) => `${r.market}>=${r.min}(${r.record})`).join("  ")}`);
    for (const [wn, w] of [["held-out 2025-26", HELD], ["owner Sep-Oct 2026", OWNER]] as const) {
      const s = score(inWin(data.get(c)!, w), rules);
      console.log(`  ${wn.padEnd(20)} n=${String(s.n).padStart(5)}  hit ${pc(s.hit)}  stated ${pc(s.stated)}  rules ${pc(s.sweetShare)} of picks (hit ${pc(s.sweetHit)})  ranker rest hit ${pc(s.restHit)}`);
    }
  }
}

if (process.argv[1]?.endsWith("audit-layer.ts")) main();
