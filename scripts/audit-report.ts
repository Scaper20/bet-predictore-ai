/**
 * Reads the per-fixture JSON written by audit-eval.ts and prints paired
 * comparisons: log loss on every fixture, pick quality on the published pick,
 * and bootstrap intervals on the difference to a base config.
 *
 *   npx tsx scripts/audit-report.ts --dir=<scratch> --base=legacy --cfgs=a,b --win=A
 *
 * Windows: A = 1 Aug 2023 - 30 Jun 2026 (development), B = 1 Sep - 31 Oct 2026
 * (the owner's check sample), M = month-by-month series.
 */

import fs from "node:fs";
import path from "node:path";
import { deVig } from "../src/lib/model/backtest";
import { priceFor, type Row } from "./lib/football-data-uk";
import type { Rec } from "./audit-eval";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const dir = arg("dir") ?? "/tmp";
const UTC = (s: string) => Date.parse(s);
export const WINDOWS: Record<string, [number, number]> = {
  A: [UTC("2023-08-01"), UTC("2026-07-01")],
  H: [UTC("2025-07-01"), UTC("2026-07-01")],
  B: [UTC("2026-09-01"), UTC("2026-11-01")],
};

export function loadCfg(name: string): Rec[] {
  return JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"));
}

const ll = (p: number) => -Math.log(Math.max(1e-9, p));

function res1x2(r: Rec) {
  return r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2;
}
export function llMatch(r: Rec): number {
  const p = [r.p["1x2:home"], r.p["1x2:draw"], r.p["1x2:away"]];
  return ll(p[res1x2(r)]);
}
export function llOu(r: Rec, line = "2.5"): number {
  const over = r.hg + r.ag > Number(line);
  const po = r.p[`ou:over:${line}`];
  return ll(over ? po : 1 - po);
}
function mktLl(r: Rec): number | null {
  if (!r.close) return null;
  return ll(deVig(r.close)[res1x2(r)]);
}
function mktLlOu(r: Rec): number | null {
  if (!r.closeOu) return null;
  const [o] = deVig(r.closeOu);
  return ll(r.hg + r.ag > 2.5 ? o : 1 - o);
}

function roiOf(r: Rec): { price?: number } {
  if (!r.pick) return {};
  const row = {
    close: r.close ? { home: r.close[0], draw: r.close[1], away: r.close[2] } : undefined,
    closeOu: r.closeOu ? { over: r.closeOu[0], under: r.closeOu[1] } : undefined,
  } as Row;
  return priceFor(r.pick.market, row);
}

export interface Summary {
  n: number;
  ll1x2: number;
  llOu25: number;
  llOu15: number;
  llOu35: number;
  mkt1x2: number | null;
  mktOu: number | null;
  /** Mean modelled total goals minus actual (positive = model high). */
  totalBias: number;
  picks: number;
  hit: number;
  stated: number;
  roi: number | null;
  priced: number;
  overShare: number;
  overHit: number | null;
  overN: number;
}

export function summarise(rs: Rec[]): Summary {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const withClose = rs.filter((r) => r.close);
  const withOu = rs.filter((r) => r.closeOu);
  const picks = rs.filter((r) => r.pick && (r.pick.outcome === "win" || r.pick.outcome === "lose"));
  const wins = picks.filter((r) => r.pick!.outcome === "win").length;
  let staked = 0;
  let profit = 0;
  for (const r of rs) {
    const price = roiOf(r).price;
    if (price === undefined || !(price > 1) || !r.pick) continue;
    if (r.pick.outcome === "win") profit += price - 1;
    else if (r.pick.outcome === "lose") profit -= 1;
    else continue;
    staked++;
  }
  const overs = picks.filter((r) => r.pick!.market.startsWith("ou:over:"));
  return {
    n: rs.length,
    ll1x2: mean(rs.map(llMatch)),
    llOu25: mean(rs.map((r) => llOu(r, "2.5"))),
    llOu15: mean(rs.map((r) => llOu(r, "1.5"))),
    llOu35: mean(rs.map((r) => llOu(r, "3.5"))),
    mkt1x2: withClose.length ? mean(withClose.map((r) => mktLl(r)!)) : null,
    mktOu: withOu.length ? mean(withOu.map((r) => mktLlOu(r)!)) : null,
    totalBias: mean(rs.map((r) => r.lambda[0] + r.lambda[1] - r.hg - r.ag)),
    picks: picks.length,
    hit: wins / Math.max(1, picks.length),
    stated: mean(picks.map((r) => r.pick!.prob)),
    roi: staked ? profit / staked : null,
    priced: staked,
    overShare: picks.length ? overs.length / picks.length : 0,
    overHit: overs.length ? overs.filter((r) => r.pick!.outcome === "win").length / overs.length : null,
    overN: overs.length,
  };
}

export function inWindow(rs: Rec[], w: string): Rec[] {
  const [a, b] = WINDOWS[w];
  return rs.filter((r) => r.date >= a && r.date < b);
}

/** Paired bootstrap of (cfg - base) over fixtures: mean difference and 95% interval. */
export function pairedBoot(
  base: Rec[],
  cand: Rec[],
  stat: (r: Rec[]) => number,
  iters = 400,
): { diff: number; lo: number; hi: number } {
  const n = base.length;
  const diffs: number[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < iters; i++) {
    const a: Rec[] = [];
    const b: Rec[] = [];
    for (let k = 0; k < n; k++) {
      const j = Math.floor(rnd() * n);
      a.push(base[j]);
      b.push(cand[j]);
    }
    diffs.push(stat(b) - stat(a));
  }
  diffs.sort((x, y) => x - y);
  return { diff: stat(cand) - stat(base), lo: diffs[Math.floor(iters * 0.025)], hi: diffs[Math.floor(iters * 0.975)] };
}

const fastLl = (rs: Rec[]) => rs.reduce((a, r) => a + llMatch(r), 0) / rs.length;
const fastHit = (rs: Rec[]) => {
  let w = 0;
  let n = 0;
  for (const r of rs) {
    const o = r.pick?.outcome;
    if (o === "win") w++;
    if (o === "win" || o === "lose") n++;
  }
  return w / Math.max(1, n);
};
const f = (x: number | null, d = 4) => (x === null || Number.isNaN(x) ? "—" : x.toFixed(d));
const pc = (x: number | null, d = 1) => (x === null || Number.isNaN(x) ? "—" : `${(x * 100).toFixed(d)}%`);

function main() {
  const base = arg("base") ?? "legacy";
  const cfgs = (arg("cfgs") ?? "").split(",").filter(Boolean);
  const win = arg("win") ?? "A";
  const baseAll = loadCfg(base);
  const names = [base, ...cfgs];
  const data = new Map<string, Rec[]>([[base, baseAll]]);
  for (const c of cfgs) data.set(c, loadCfg(c));

  if (win === "M") {
    console.log("month      fixtures  picks  hit    stated  gap    1X2LL   OU25LL  totalBias");
    const months = new Map<string, Rec[]>();
    for (const r of baseAll) {
      const k = new Date(r.date).toISOString().slice(0, 7);
      months.set(k, [...(months.get(k) ?? []), r]);
    }
    for (const [k, rs] of [...months].sort()) {
      const s = summarise(rs);
      console.log(`${k}   ${String(s.n).padStart(6)}  ${String(s.picks).padStart(5)}  ${pc(s.hit)}  ${pc(s.stated)}  ${((s.hit - s.stated) * 100).toFixed(1).padStart(5)}  ${f(s.ll1x2)}  ${f(s.llOu25)}  ${s.totalBias.toFixed(3)}`);
    }
    return;
  }

  const sel = new Map<string, Rec[]>();
  for (const [k, v] of data) sel.set(k, inWindow(v, win));
  const b0 = sel.get(base)!;
  console.log(`window ${win}: ${b0.length} fixtures`);
  console.log("config".padEnd(18) + "1X2LL    dLL(95%CI)              OU2.5LL  OU1.5LL  OU3.5LL  picks  hit     stated  dHit(95%CI)         ROI      over%  overHit(n)");
  for (const name of names) {
    const rs = sel.get(name)!;
    if (rs.length !== b0.length) console.log(`  !! ${name}: ${rs.length} fixtures vs ${b0.length}`);
    const s = summarise(rs);
    let d = "";
    let h = "";
    if (name !== base && rs.length === b0.length) {
      const pl = pairedBoot(b0, rs, fastLl, 200);
      const ph = pairedBoot(b0, rs, fastHit, 200);
      d = `${pl.diff >= 0 ? "+" : ""}${pl.diff.toFixed(4)} [${pl.lo.toFixed(4)},${pl.hi.toFixed(4)}]`;
      h = `${ph.diff >= 0 ? "+" : ""}${(ph.diff * 100).toFixed(2)} [${(ph.lo * 100).toFixed(2)},${(ph.hi * 100).toFixed(2)}]`;
    }
    console.log(
      `${name.padEnd(18)}${f(s.ll1x2)}   ${d.padEnd(24)}${f(s.llOu25)}   ${f(s.llOu15)}   ${f(s.llOu35)}   ${String(s.picks).padStart(5)}  ${pc(s.hit)}  ${pc(s.stated)}  ${h.padEnd(20)}${f(s.roi === null ? null : s.roi * 100, 2).padStart(7)}%  ${pc(s.overShare, 0).padStart(4)}  ${pc(s.overHit)}(${s.overN})`,
    );
  }
  const s0 = summarise(b0);
  console.log(`market: 1X2 ${f(s0.mkt1x2)}  O/U2.5 ${f(s0.mktOu)}`);
}

if (process.argv[1]?.endsWith("audit-report.ts")) main();
