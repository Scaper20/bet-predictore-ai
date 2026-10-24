/**
 * Research only: how honest the model's chance is on every market we price,
 * and whether the closing market, a recalibration or a pick rule would make
 * it more honest. Nothing here changes what the site publishes.
 *
 * Reads the walk-forward predictions scripts/niche-lab.ts writes (17
 * divisions, July 2024 on, each matchday fitted on results strictly before
 * it, with the closing 1X2, over/under 2.5 and Asian line beside it). Prices
 * every leg the way the site does (leg-pricing.ts: whole lines push, quarter
 * lines split, "survive" = not a full loss) and grades it against the result.
 *
 * TUNE is July 2024 to June 2025, where any map or weight is fitted; HOLDOUT
 * is July 2025 on, where it is only measured.
 *
 *   npx tsx scripts/niche-lab.ts --stage=predict      (once, slow)
 *   npx tsx scripts/market-audit.ts
 *   npx tsx scripts/market-audit.ts --json=.backtest-cache/market-audit.json
 */

import fs from "node:fs";
import { scoreMatrix } from "../src/lib/model/poisson";
import { statGrid, STAT_LINES } from "../src/lib/model/match-stats";
import { gradeLeg, type LegOutcome } from "../src/lib/leg-pricing";
import { fitPlatt, platt } from "./lib/niche-analyse";
import type { Pred } from "./niche-lab";

const PREDS_FILE = ".backtest-cache/niche-preds.json";
const HOLDOUT = Date.UTC(2025, 6, 1);
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : "–");
const pt = (x: number) => `${(100 * x).toFixed(1)}pt`;

/* -------------------------------------------------------------- markets */

const signed = (l: number) => (l > 0 ? `+${l}` : String(l));
const AH_LINES = [-2.5, -2, -1.75, -1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];

/** A market id and the family it is reported under. */
interface MarketDef {
  key: string;
  family: string;
}

function goalMarkets(): MarketDef[] {
  const out: MarketDef[] = [];
  for (const s of ["home", "draw", "away"]) out.push({ key: `1x2:${s}`, family: `1X2 ${s}` });
  for (const s of ["home-draw", "away-draw", "home-away"]) out.push({ key: `dc:${s}`, family: `DC ${s}` });
  for (const l of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    out.push({ key: `ou:over:${l}`, family: "Over (half lines)" }, { key: `ou:under:${l}`, family: "Under (half lines)" });
  }
  for (const l of [2.25, 2.75]) out.push({ key: `ou:over:${l}`, family: "O/U quarter lines" }, { key: `ou:under:${l}`, family: "O/U quarter lines" });
  out.push({ key: "btts:yes", family: "GG/NG" }, { key: "btts:no", family: "GG/NG" });
  for (const side of ["home", "away"]) {
    for (const l of AH_LINES) {
      const half = Math.abs((l * 2) % 2) === 1;
      const whole = Number.isInteger(l);
      const kind = half ? (l < 0 ? "AH giving (−0.5, −1.5, −2.5)" : "AH getting (+0.5, +1.5, +2.5)") : whole ? "AH whole lines (refund on the line)" : "AH quarter lines";
      out.push({ key: `ah:${side}:${signed(l)}`, family: kind });
    }
  }
  for (const side of ["home", "away"]) {
    for (const l of [0.5, 1.5, 2.5]) {
      out.push({ key: `tg:${side}:over:${l}`, family: "Team goals over" }, { key: `tg:${side}:under:${l}`, family: "Team goals under" });
    }
  }
  out.push({ key: "eh:draw:-1", family: "3-way handicap draw" }, { key: "eh:draw:1", family: "3-way handicap draw" });
  return out;
}

const STAT_PREFIX: Record<string, string> = { corners: "corners", shots: "shots", shotsOnTarget: "sot" };
const STAT_NAME: Record<string, string> = { corners: "Corners", shots: "Shots", shotsOnTarget: "Shots on target" };
const KINDS = ["corners", "shots", "shotsOnTarget"] as const;

function statMarkets(kind: (typeof KINDS)[number]): MarketDef[] {
  const L = STAT_LINES[kind];
  const p = STAT_PREFIX[kind];
  const n = STAT_NAME[kind];
  const out: MarketDef[] = [];
  for (const l of L.total) out.push({ key: `${p}:over:${l}`, family: `${n} total` }, { key: `${p}:under:${l}`, family: `${n} total` });
  for (const side of ["home", "away"]) {
    for (const l of L.team) out.push({ key: `${p}:${side}:over:${l}`, family: `${n} team` }, { key: `${p}:${side}:under:${l}`, family: `${n} team` });
  }
  for (const w of ["home", "away", "level", "home-or-level", "away-or-level"]) out.push({ key: `${p}:most:${w}`, family: `${n} most (1X2)` });
  for (const l of L.handicap.filter((x) => !Number.isInteger(x))) {
    out.push({ key: `${p}:hcp:home:${signed(l)}`, family: `${n} handicap` }, { key: `${p}:hcp:away:${signed(-l)}`, family: `${n} handicap` });
  }
  return out;
}

/* ---------------------------------------------------- grading, memoised */

/** Each market's grade at every score up to n-n: fixture-independent, so worked out once. */
const tables = new Map<string, Uint8Array>();
const CODE: Record<LegOutcome, number> = { win: 1, halfWin: 2, push: 3, halfLose: 4, lose: 5 };

function table(market: string, n: number): Uint8Array {
  const k = `${market}|${n}`;
  let t = tables.get(k);
  if (!t) {
    t = new Uint8Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) t[i * n + j] = CODE[gradeLeg(market, i, j) ?? "lose"];
    tables.set(k, t);
  }
  return t;
}

/** P(not a full loss) and P(refund or half settlement) from a grid. */
function survive(market: string, grid: number[][]): { p: number; refund: number } {
  const n = grid.length;
  const t = table(market, n);
  let p = 0, refund = 0;
  for (let i = 0; i < n; i++) {
    const row = grid[i];
    for (let j = 0; j < n; j++) {
      const g = t[i * n + j];
      if (g !== 5) p += row[j];
      if (g >= 2 && g <= 4) refund += row[j];
    }
  }
  return { p, refund };
}

const survived = (market: string, h: number, a: number) => gradeLeg(market, h, a) !== "lose";

/* ------------------------------------------------------------ the rows */

interface Obs {
  /** Index into preds. */
  i: number;
  key: string;
  family: string;
  p: number;
  y: number;
  hold: boolean;
}

function collect(preds: Pred[]): Obs[] {
  const goals = goalMarkets();
  const stats = Object.fromEntries(KINDS.map((k) => [k, statMarkets(k)])) as Record<(typeof KINDS)[number], MarketDef[]>;
  const out: Obs[] = [];
  preds.forEach((r, i) => {
    const hold = r.t >= HOLDOUT;
    const g = scoreMatrix(r.dc[0], r.dc[1], r.dc[2]);
    for (const m of goals) out.push({ i, key: m.key, family: m.family, p: survive(m.key, g).p, y: Number(survived(m.key, r.hg, r.ag)), hold });
    for (const k of KINDS) {
      const v = r.st[k];
      if (!v || v[6] < 0) continue;
      const grid = statGrid({ home: v[0], away: v[1] }, { kTotal: v[2], rho: v[3] }, STAT_LINES[k].max);
      for (const m of stats[k]) out.push({ i, key: m.key, family: m.family, p: survive(m.key, grid).p, y: Number(survived(m.key, v[6], v[7])), hold });
    }
  });
  return out;
}

/* ------------------------------------------------------------- metrics */

const clip = (p: number) => Math.min(0.999, Math.max(0.001, p));
const ll = (p: number, y: number) => -(y ? Math.log(clip(p)) : Math.log(1 - clip(p)));

/** Expected calibration error over 5-point bins, weighted by count. */
function ece(xs: { p: number; y: number }[]): number {
  const bins = new Map<number, { n: number; p: number; y: number }>();
  for (const x of xs) {
    const b = Math.min(19, Math.floor(x.p * 20));
    const s = bins.get(b) ?? { n: 0, p: 0, y: 0 };
    s.n++; s.p += x.p; s.y += x.y;
    bins.set(b, s);
  }
  let e = 0;
  for (const s of bins.values()) e += (s.n / xs.length) * Math.abs(s.p / s.n - s.y / s.n);
  return e;
}

/** Claimed and landed for picks at or above a chance (and below 92%, which pays nothing). */
function picks(xs: { p: number; y: number }[], from: number) {
  const sel = xs.filter((x) => x.p >= from && x.p < 0.92);
  return {
    n: sel.length,
    claimed: sel.reduce((s, x) => s + x.p, 0) / Math.max(1, sel.length),
    landed: sel.reduce((s, x) => s + x.y, 0) / Math.max(1, sel.length),
  };
}

interface FamilyRow {
  family: string;
  n: number;
  claimed: number;
  landed: number;
  ece: number;
  /** 1 - model log loss / base-rate log loss, base rate from the tune season per division and market. */
  skill: number;
  p65: ReturnType<typeof picks>;
  p75: ReturnType<typeof picks>;
  /** The same, after a per-family Platt map fitted on the tune season. */
  eceRecal: number;
  skillRecal: number;
  p65Recal: ReturnType<typeof picks>;
}

function families(obs: Obs[], preds: Pred[]): FamilyRow[] {
  // Base rate per division and market, from the tune season (fallback: all divisions).
  const rate = new Map<string, { n: number; y: number }>();
  for (const o of obs) {
    if (o.hold) continue;
    for (const k of [`${preds[o.i].d}|${o.key}`, `*|${o.key}`]) {
      const s = rate.get(k) ?? { n: 0, y: 0 };
      s.n++; s.y += o.y;
      rate.set(k, s);
    }
  }
  const base = (o: Obs) => {
    const s = rate.get(`${preds[o.i].d}|${o.key}`);
    const all = rate.get(`*|${o.key}`)!;
    // Shrink a thin division toward the pooled rate.
    return s ? (s.y + 20 * (all.y / all.n)) / (s.n + 20) : all.y / all.n;
  };

  const byFamily = new Map<string, Obs[]>();
  for (const o of obs) {
    const list = byFamily.get(o.family);
    if (list) list.push(o);
    else byFamily.set(o.family, [o]);
  }

  return [...byFamily].map(([family, xs]) => {
    const tune = xs.filter((x) => !x.hold);
    const hold = xs.filter((x) => x.hold);
    const map = fitPlatt(tune.map((x) => x.p), tune.map((x) => x.y));
    const recal = hold.map((x) => ({ ...x, p: platt(map, x.p) }));
    const llBase = hold.reduce((s, x) => s + ll(base(x), x.y), 0);
    const llModel = hold.reduce((s, x) => s + ll(x.p, x.y), 0);
    const llRecal = recal.reduce((s, x) => s + ll(x.p, x.y), 0);
    return {
      family,
      n: hold.length,
      claimed: hold.reduce((s, x) => s + x.p, 0) / hold.length,
      landed: hold.reduce((s, x) => s + x.y, 0) / hold.length,
      ece: ece(hold),
      skill: 1 - llModel / llBase,
      p65: picks(hold, 0.65),
      p75: picks(hold, 0.75),
      eceRecal: ece(recal),
      skillRecal: 1 - llRecal / llBase,
      p65Recal: picks(recal, 0.65),
    };
  });
}

/* ------------------------------------------------- against the market */

const logit = (p: number) => Math.log(clip(p) / (1 - clip(p)));
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const blend = (model: number, market: number, w: number) => sig(w * logit(model) + (1 - w) * logit(market));

/** The closing market's chance for a selection, where it priced one. */
function marketChance(r: Pred, key: string): number | null {
  if (!r.mk) return null;
  const [h, d, a, o25] = r.mk;
  switch (key) {
    case "1x2:home": return h;
    case "1x2:draw": return d;
    case "1x2:away": return a;
    case "dc:home-draw": return h + d;
    case "dc:away-draw": return a + d;
    case "dc:home-away": return h + a;
    case "ou:over:2.5": return o25;
    case "ou:under:2.5": return 1 - o25;
    default: return null;
  }
}

interface MarketRow {
  key: string;
  n: number;
  llModel: number;
  llMarket: number;
  /** Model weight in the logit blend, chosen on tune. */
  w: number;
  llBlend: number;
  eceModel: number;
  eceMarket: number;
  eceBlend: number;
}

function againstMarket(obs: Obs[], preds: Pred[]): MarketRow[] {
  const keys = ["1x2:home", "1x2:draw", "1x2:away", "dc:home-draw", "dc:away-draw", "dc:home-away", "ou:over:2.5"];
  return keys.map((key) => {
    const xs = obs
      .filter((o) => o.key === key)
      .map((o) => ({ ...o, m: marketChance(preds[o.i], key) }))
      .filter((o): o is typeof o & { m: number } => o.m !== null && o.m > 0);
    const tune = xs.filter((x) => !x.hold);
    const hold = xs.filter((x) => x.hold);
    let best = { w: 0, l: Infinity };
    for (let w = 0; w <= 1.0001; w += 0.05) {
      const l = tune.reduce((s, x) => s + ll(blend(x.p, x.m, w), x.y), 0);
      if (l < best.l) best = { w, l };
    }
    const mean = (f: (x: (typeof hold)[number]) => number) => hold.reduce((s, x) => s + f(x), 0) / hold.length;
    return {
      key,
      n: hold.length,
      llModel: mean((x) => ll(x.p, x.y)),
      llMarket: mean((x) => ll(x.m, x.y)),
      w: Math.round(best.w * 100) / 100,
      llBlend: mean((x) => ll(blend(x.p, x.m, best.w), x.y)),
      eceModel: ece(hold),
      eceMarket: ece(hold.map((x) => ({ p: x.m, y: x.y }))),
      eceBlend: ece(hold.map((x) => ({ p: blend(x.p, x.m, best.w), y: x.y }))),
    };
  });
}

/* -------------------------------------------- draws and home advantage */

interface LeagueBias {
  d: string;
  n: number;
  model: [number, number, number];
  market: [number, number, number];
  actual: [number, number, number];
}

function bias(preds: Pred[]): LeagueBias[] {
  const by = new Map<string, Pred[]>();
  for (const r of preds) {
    if (r.t < HOLDOUT || !r.mk) continue;
    const list = by.get(r.d);
    if (list) list.push(r);
    else by.set(r.d, [r]);
  }
  const rows: LeagueBias[] = [];
  for (const [d, rs] of [...by, ["ALL", preds.filter((r) => r.t >= HOLDOUT && r.mk)] as const]) {
    const m = [0, 0, 0], k = [0, 0, 0], a = [0, 0, 0];
    for (const r of rs) {
      const g = scoreMatrix(r.dc[0], r.dc[1], r.dc[2]);
      let h = 0, dr = 0, aw = 0;
      g.forEach((row, x) => row.forEach((p, y) => (x > y ? (h += p) : x === y ? (dr += p) : (aw += p))));
      m[0] += h; m[1] += dr; m[2] += aw;
      k[0] += r.mk![0]; k[1] += r.mk![1]; k[2] += r.mk![2];
      a[r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2]++;
    }
    const n = rs.length;
    const div = (v: number[]) => v.map((x) => x / n) as [number, number, number];
    rows.push({ d, n, model: div(m), market: div(k), actual: div(a) });
  }
  return rows;
}

/* ------------------------------------------------------- pick rules */

interface RuleRow {
  rule: string;
  family: string;
  kept: ReturnType<typeof picks>;
  dropped: ReturnType<typeof picks>;
}

/** The headline pick per fixture, as the site published it, and what each rule would have done to it. */
function pickRules(preds: Pred[]): RuleRow[] {
  const rows: RuleRow[] = [];
  const hold = preds.filter((r) => r.t >= HOLDOUT && r.pub);
  const fam = (m: string) => (m.startsWith("dc:") || m.startsWith("1x2:") ? m : m.split(":").slice(0, 2).join(":"));
  const graded = hold.map((r) => ({ r, market: r.pub![0], p: r.pub![1], y: Number(survived(r.pub![0], r.hg, r.ag)) }));
  const families = [...new Set(graded.map((g) => fam(g.market)))];

  const apply = (rule: string, drop: (g: (typeof graded)[number]) => boolean | null) => {
    for (const f of [...families, "all"]) {
      const xs = graded.filter((g) => f === "all" || fam(g.market) === f);
      const judged = xs.map((g) => ({ g, d: drop(g) })).filter((x) => x.d !== null);
      if (judged.length < 20) continue;
      rows.push({
        rule,
        family: f,
        kept: picks(judged.filter((x) => !x.d).map((x) => x.g), 0),
        dropped: picks(judged.filter((x) => x.d).map((x) => x.g), 0),
      });
    }
  };

  apply("as published", () => false);
  // Market dissent: the closing market rates the pick well below the model.
  for (const gap of [0.03, 0.05, 0.08]) {
    apply(`skip when market is ${Math.round(gap * 100)}pt+ below the model`, (g) => {
      const m = marketChance(g.r, g.market);
      return m === null ? null : m < g.p - gap;
    });
  }
  // Away-attack guard on Home or Draw: the away side's expected goals close to the home side's.
  for (const ratio of [0.7, 0.8, 0.9]) {
    apply(`Home or Draw: skip when away xG ≥ ${ratio} × home xG`, (g) => (g.market === "dc:home-draw" ? g.r.dc[1] >= ratio * g.r.dc[0] : null));
  }
  return rows;
}

/* --------------------------------------------------------------- main */

function main() {
  const preds = JSON.parse(fs.readFileSync(PREDS_FILE, "utf8")) as Pred[];
  const t0 = Date.now();
  const obs = collect(preds);
  const fams = families(obs, preds).sort((a, b) => a.family.localeCompare(b.family));
  const market = againstMarket(obs, preds);
  const leagues = bias(preds);
  const rules = pickRules(preds);
  const nHold = preds.filter((r) => r.t >= HOLDOUT).length;

  console.log(`# Market audit\n\n${preds.length} fixtures (${nHold} in the holdout, July 2025 on), ${obs.length} priced legs, ${((Date.now() - t0) / 1000).toFixed(0)}s.\n`);
  console.log("## Every family, holdout\n");
  console.log("| Family | Legs | Claimed | Landed | Calibration error | Skill vs base rate | 65%+ claimed → landed (n) | 75%+ claimed → landed (n) | Recalibrated: error, skill, 65%+ |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const f of fams) {
    console.log(
      `| ${f.family} | ${f.n} | ${pct(f.claimed)} | ${pct(f.landed)} | ${pt(f.ece)} | ${pct(f.skill)} | ${pct(f.p65.claimed)} → ${pct(f.p65.landed)} (${f.p65.n}) | ${pct(f.p75.claimed)} → ${pct(f.p75.landed)} (${f.p75.n}) | ${pt(f.eceRecal)}, ${pct(f.skillRecal)}, ${pct(f.p65Recal.claimed)} → ${pct(f.p65Recal.landed)} (${f.p65Recal.n}) |`,
    );
  }

  console.log("\n## Against the closing market, holdout (log loss, lower is better)\n");
  console.log("| Selection | n | Model | Market | Blend (model weight) | Calibration error model / market / blend |");
  console.log("|---|---|---|---|---|---|");
  for (const m of market) {
    console.log(`| ${m.key} | ${m.n} | ${m.llModel.toFixed(4)} | ${m.llMarket.toFixed(4)} | ${m.llBlend.toFixed(4)} (${m.w}) | ${pt(m.eceModel)} / ${pt(m.eceMarket)} / ${pt(m.eceBlend)} |`);
  }

  console.log("\n## Home / draw / away, holdout: model vs market vs what happened\n");
  console.log("| League | n | Model H/D/A | Market H/D/A | Actual H/D/A |");
  console.log("|---|---|---|---|---|");
  const hda = (v: number[]) => v.map((x) => pct(x, 0)).join(" / ");
  for (const l of leagues.sort((a, b) => (a.d === "ALL" ? -1 : b.d === "ALL" ? 1 : a.d.localeCompare(b.d)))) {
    console.log(`| ${l.d} | ${l.n} | ${hda(l.model)} | ${hda(l.market)} | ${hda(l.actual)} |`);
  }

  console.log("\n## Headline picks and pick rules, holdout\n");
  console.log("| Rule | Pick | Kept: claimed → landed (n) | Dropped: claimed → landed (n) |");
  console.log("|---|---|---|---|");
  for (const r of rules) {
    console.log(
      `| ${r.rule} | ${r.family} | ${pct(r.kept.claimed)} → ${pct(r.kept.landed)} (${r.kept.n}) | ${r.dropped.n ? `${pct(r.dropped.claimed)} → ${pct(r.dropped.landed)} (${r.dropped.n})` : "–"} |`,
    );
  }

  const out = arg("json");
  if (out) fs.writeFileSync(out, JSON.stringify({ fixtures: preds.length, holdout: nHold, families: fams, market, leagues, rules }, null, 1));
}

main();
