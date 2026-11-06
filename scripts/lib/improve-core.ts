/**
 * Shared pieces for the improvement search (improve-*.ts): reading the lab's
 * per-fixture records, turning goal rates into every market, removing a
 * bookmaker's margin three ways, and solving for the goal rates a market's
 * prices imply.
 */
import fs from "node:fs";
import path from "node:path";
import { scoreMatrix } from "../../src/lib/model/poisson";

export const DAY = 86_400_000;
const T = (s: string) => Date.parse(s);
export const WINDOWS: Record<string, [number, number]> = {
  DEV: [T("2022-08-01"), T("2025-07-01")],
  HELD: [T("2025-07-01"), T("2026-07-01")],
  OWNER: [T("2026-09-01"), T("2026-11-01")],
};

export interface Price3 { home: number; draw: number; away: number }
export interface Fixture {
  div: string;
  date: number;
  hg: number;
  ag: number;
  close?: Price3;
  open?: Price3;
  closeOu?: { over: number; under: number };
  openOu?: { over: number; under: number };
  closeAh?: { line: number; home: number; away: number };
  openAh?: { line: number; home: number; away: number };
  hasXg: boolean;
  v: Record<string, [number, number, number]>;
}

/**
 * The lab's records. Several directories (runs of different variants over the
 * same fixtures) are merged fixture by fixture: same division, same row order,
 * checked on date and score.
 */
export function loadLab(dir: string | string[], divs?: string[]): Fixture[] {
  const dirs = Array.isArray(dir) ? dir : [dir];
  const out: Fixture[] = [];
  for (const f of fs.readdirSync(dirs[0])) {
    if (!f.endsWith(".json")) continue;
    const div = f.replace(".json", "");
    if (divs && !divs.includes(div)) continue;
    const base = JSON.parse(fs.readFileSync(path.join(dirs[0], f), "utf8")) as Fixture[];
    for (const extra of dirs.slice(1)) {
      const file = path.join(extra, f);
      if (!fs.existsSync(file)) continue;
      const more = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture[];
      if (more.length !== base.length) throw new Error(`${f}: ${more.length} fixtures in ${extra}, ${base.length} in ${dirs[0]}`);
      more.forEach((m, i) => {
        if (m.date !== base[i].date || m.hg !== base[i].hg || m.ag !== base[i].ag) throw new Error(`${f} row ${i} differs between runs`);
        Object.assign(base[i].v, m.v);
        base[i].hasXg = base[i].hasXg || m.hasXg;
      });
    }
    out.push(...base);
  }
  return out.sort((a, b) => a.date - b.date);
}

export const inWindow = (fx: Fixture[], w: string) => fx.filter((f) => f.date >= WINDOWS[w][0] && f.date < WINDOWS[w][1]);

/* ----------------------------------------------------------------- markets */

export interface Probs {
  home: number; draw: number; away: number;
  o05: number; o15: number; o25: number; o35: number; o45: number;
  btts: number;
  homeOver05: number; awayOver05: number; homeOver15: number; awayOver15: number;
}

export function probsOf(lam: number, mu: number, rho: number): Probs {
  const g = scoreMatrix(lam, mu, rho);
  let home = 0, draw = 0, away = 0, btts = 0, h05 = 0, a05 = 0, h15 = 0, a15 = 0;
  const tot = new Array(24).fill(0);
  for (let x = 0; x < g.length; x++)
    for (let y = 0; y < g[x].length; y++) {
      const p = g[x][y];
      if (x > y) home += p; else if (x === y) draw += p; else away += p;
      if (x > 0 && y > 0) btts += p;
      if (x > 0) h05 += p;
      if (y > 0) a05 += p;
      if (x > 1) h15 += p;
      if (y > 1) a15 += p;
      tot[x + y] += p;
    }
  const over = (k: number) => 1 - tot.slice(0, k + 1).reduce((a, b) => a + b, 0);
  return { home, draw, away, o05: over(0), o15: over(1), o25: over(2), o35: over(3), o45: over(4), btts, homeOver05: h05, awayOver05: a05, homeOver15: h15, awayOver15: a15 };
}

/** Rates, log-averaged across variants with weights summing to 1. */
export function blendRates(parts: { rates: [number, number, number]; w: number }[]): [number, number, number] {
  let l = 0, m = 0, r = 0;
  for (const { rates, w } of parts) {
    l += w * Math.log(rates[0]);
    m += w * Math.log(rates[1]);
    r += w * rates[2];
  }
  return [Math.exp(l), Math.exp(m), r];
}

/* ------------------------------------------------------------------ de-vig */

export type Devig = "proportional" | "power" | "shin";

/** Fair probabilities from decimal prices, margin removed. */
export function devig(prices: number[], how: Devig = "proportional"): number[] {
  const imp = prices.map((p) => 1 / p);
  const sum = imp.reduce((a, b) => a + b, 0);
  if (how === "proportional") return imp.map((x) => x / sum);
  if (how === "power") {
    // p_i = imp_i ^ c with c chosen so the probabilities sum to 1 (c > 1 shrinks the long shots most).
    let lo = 0.5, hi = 3;
    for (let i = 0; i < 60; i++) {
      const c = (lo + hi) / 2;
      const s = imp.reduce((a, x) => a + Math.pow(x, c), 0);
      if (s > 1) lo = c; else hi = c;
    }
    const c = (lo + hi) / 2;
    return imp.map((x) => Math.pow(x, c));
  }
  // Shin (1993): the share z of insider money is found so the probabilities sum to 1.
  const n = imp.length;
  let lo = 0, hi = 0.4;
  const probs = (z: number) => imp.map((q) => (Math.sqrt(z * z + 4 * (1 - z) * (q * q) / sum) - z) / (2 * (1 - z)));
  for (let i = 0; i < 60; i++) {
    const z = (lo + hi) / 2;
    const s = probs(z).reduce((a, b) => a + b, 0);
    if (s > 1) lo = z; else hi = z;
  }
  const p = probs((lo + hi) / 2);
  const t = p.reduce((a, b) => a + b, 0);
  return p.slice(0, n).map((x) => x / t);
}

export const fair3 = (p: Price3, how: Devig = "proportional"): [number, number, number] => devig([p.home, p.draw, p.away], how) as [number, number, number];
export const fairOu = (p: { over: number; under: number }, how: Devig = "proportional"): number => devig([p.over, p.under], how)[0];

/* ------------------------------------------------- the rates a market implies */

// The solver ships in the app (it fills the training archive), so the lab uses that very code.
import { impliedRates } from "../../src/lib/model/market-goals";
export { impliedRates };

/* -------------------------------------------------------------------- stats */

export const ll = (p: number) => -Math.log(Math.max(1e-9, p));
export const result3 = (f: Fixture) => (f.hg > f.ag ? 0 : f.hg === f.ag ? 1 : 2);

export interface MeanSe { mean: number; se: number; n: number }
export function meanSe(xs: number[]): MeanSe {
  const n = xs.length;
  if (n === 0) return { mean: NaN, se: NaN, n: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1);
  return { mean: m, se: Math.sqrt(v / n), n };
}
export const fmt = (x: MeanSe, d = 4) => `${x.mean >= 0 ? "" : ""}${x.mean.toFixed(d)}`;
export const fmtDiff = (x: MeanSe, d = 4) => `${x.mean >= 0 ? "+" : ""}${x.mean.toFixed(d)} ±${(1.96 * x.se).toFixed(d)}`;

/* ------------------------------------------------- anchored rates, cached */

export type AnchorKind = "open" | "close";
export class AnchorCache {
  private cache: Record<string, [number, number]>;
  constructor(private file: string) {
    this.cache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, [number, number]>) : {};
  }
  /** The rates a market's 1X2 and over/under 2.5 prices imply, anchored at the model's own low-score parameter. */
  get(f: Fixture, kind: AnchorKind, how: Devig = "proportional", from = "base"): [number, number] | null {
    const pr = f[kind];
    const ou = kind === "open" ? f.openOu : f.closeOu;
    if (!pr || !ou || !f.v[from]) return null;
    const k = `${f.div}|${f.date}|${f.hg}|${f.ag}|${kind}|${how}${from}`;
    const hit = this.cache[k];
    if (hit) return hit;
    const [pH, , pA] = fair3(pr, how);
    const r = impliedRates(pH, pA, fairOu(ou, how), f.v[from][2], [f.v[from][0], f.v[from][1]]);
    this.cache[k] = r;
    return r;
  }
  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.cache));
  }
}

/** Model rates pulled toward the anchored ones by `w` in log space (0 = model, 1 = the market's). */
export function anchoredBlend(f: Fixture, cache: AnchorCache, kind: AnchorKind, w: number, from = "base", how: Devig = "proportional"): [number, number, number] | null {
  const a = cache.get(f, kind, how, from);
  return a ? blendRates([{ rates: f.v[from], w: 1 - w }, { rates: [a[0], a[1], f.v[from][2]], w }]) : null;
}
