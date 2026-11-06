/**
 * Improvement search, step 2: probability quality, by itself and anchored to
 * the market. Reads the lab's per-fixture records (improve-lab.ts).
 *
 *   npx tsx scripts/improve-prob.ts --dir=<lab dir> [--part=devig|variants|anchor|all]
 *
 * Every number is a mean log loss over fixtures (lower is better) with a 95%
 * interval on the difference from the base model, on three windows: DEV
 * (Aug 2022 to Jun 2025), HELD (2025-26) and OWNER (Sep-Oct 2026).
 */
import {
  AnchorCache, anchoredBlend, blendRates, fair3, fairOu, fmt, fmtDiff, inWindow, ll, loadLab, meanSe, probsOf, result3,
  type Devig, type Fixture, type Probs,
} from "./lib/improve-core";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const dirs = (arg("dir") ?? "/tmp/lab").split(",");
const dir = dirs[0];
const part = arg("part") ?? "all";
const fixtures = loadLab(dirs);
const W = ["DEV", "HELD", "OWNER"];

type Metric = (f: Fixture, p: Probs) => number;
const METRICS: Record<string, Metric> = {
  "1X2": (f, p) => ll([p.home, p.draw, p.away][result3(f)]),
  "O2.5": (f, p) => ll(f.hg + f.ag > 2.5 ? p.o25 : 1 - p.o25),
  "O1.5": (f, p) => ll(f.hg + f.ag > 1.5 ? p.o15 : 1 - p.o15),
  "O3.5": (f, p) => ll(f.hg + f.ag > 3.5 ? p.o35 : 1 - p.o35),
  BTTS: (f, p) => ll(f.hg > 0 && f.ag > 0 ? p.btts : 1 - p.btts),
};

const probCache = new Map<string, Probs>();
function probsFor(f: Fixture, key: string, rates: [number, number, number]): Probs {
  const k = `${f.div}|${f.date}|${f.hg}|${f.ag}|${key}`;
  let p = probCache.get(k);
  if (!p) probCache.set(k, (p = probsOf(rates[0], rates[1], rates[2])));
  return p;
}

/** Paired comparison table of named rate sources against a base. */
function compare(title: string, fx: Fixture[], sources: Record<string, (f: Fixture) => [number, number, number] | null>, base: string, metrics = Object.keys(METRICS)) {
  console.log(`\n=== ${title}`);
  for (const w of W) {
    const sub = inWindow(fx, w);
    console.log(`\n  ${w}: ${sub.length} fixtures`);
    console.log("  " + "source".padEnd(30) + metrics.map((m) => m.padStart(26)).join(""));
    const rows: Record<string, number[][]> = {};
    for (const [name, fn] of Object.entries(sources)) {
      const per: number[][] = metrics.map(() => []);
      sub.forEach((f) => {
        const r = fn(f);
        if (!r) { metrics.forEach((_, j) => per[j].push(NaN)); return; }
        const p = probsFor(f, name, r);
        metrics.forEach((m, j) => per[j].push(METRICS[m](f, p)));
      });
      rows[name] = per;
    }
    for (const name of Object.keys(sources)) {
      const cells = metrics.map((_, j) => {
        const a = rows[name][j], b = rows[base][j];
        const ok = a.map((x, i) => (Number.isFinite(x) && Number.isFinite(b[i]) ? i : -1)).filter((i) => i >= 0);
        const own = meanSe(ok.map((i) => a[i]));
        if (name === base) return fmt(own).padStart(26);
        return `${fmt(own)} ${fmtDiff(meanSe(ok.map((i) => a[i] - b[i])))}`.padStart(26);
      });
      console.log("  " + name.padEnd(30) + cells.join(""));
    }
  }
}

if (part === "devig" || part === "all") {
  console.log("=== De-vig methods: log loss of the margin-free price against what happened");
  for (const kind of ["close", "open"] as const) {
    for (const w of W) {
      const sub = inWindow(fixtures, w).filter((f) => f[kind]);
      const cells = (["proportional", "power", "shin"] as Devig[]).map((how) => {
        const x = meanSe(sub.map((f) => ll(fair3(f[kind]!, how)[result3(f)])));
        return `${how} ${x.mean.toFixed(4)}`;
      });
      const ou = (["proportional", "power", "shin"] as Devig[]).map((how) => {
        const s2 = sub.filter((f) => f[kind === "close" ? "closeOu" : "openOu"]);
        const x = meanSe(s2.map((f) => { const p = fairOu(f[kind === "close" ? "closeOu" : "openOu"]!, how); return ll(f.hg + f.ag > 2.5 ? p : 1 - p); }));
        return `${how} ${x.mean.toFixed(4)}`;
      });
      console.log(`  ${kind} ${w.padEnd(6)} 1X2: ${cells.join("  ")}   O/U2.5: ${ou.join("  ")}`);
    }
  }
}

const baseRates = (f: Fixture) => f.v.base ?? null;
const variantSources = (names: string[]) => Object.fromEntries(names.filter((n) => fixtures.some((f) => f.v[n])).map((n) => [n, (f: Fixture) => f.v[n] ?? null]));

if (part === "variants" || part === "all") {
  const names = ["base", "hl90", "hl365", "hl720", "shot0", "shot75", "reg005", "reg02", "st11", "ts10", "ts60"];
  compare("Model variants (one change each), all 17 divisions", fixtures, variantSources(names), "base");
  const ens = (parts: [string, number][]) => (f: Fixture) => (parts.every(([n]) => f.v[n]) ? blendRates(parts.map(([n, w]) => ({ rates: f.v[n], w }))) : null);
  compare("Ensembles of half-lives and settings", fixtures, {
    base: baseRates,
    "base+hl365 50/50": ens([["base", 0.5], ["hl365", 0.5]]),
    "base+hl720 50/50": ens([["base", 0.5], ["hl720", 0.5]]),
    "hl90+hl365 50/50": ens([["hl90", 0.5], ["hl365", 0.5]]),
    "hl90+base+hl365+hl720": ens([["hl90", 0.25], ["base", 0.25], ["hl365", 0.25], ["hl720", 0.25]]),
    "hl90+hl720 50/50": ens([["hl90", 0.5], ["hl720", 0.5]]),
    "base+reg005 50/50": ens([["base", 0.5], ["reg005", 0.5]]),
    "base+shot0+shot75": ens([["base", 0.34], ["shot0", 0.33], ["shot75", 0.33]]),
  }, "base");
}

if (part === "anchor" || part === "all") {
  const cache = new AnchorCache(`${dir}/../anchored.json`);
  const withMarket = fixtures.filter((f) => f.open && f.openOu && f.close && f.closeOu && f.v.base);
  const sources: Record<string, (f: Fixture) => [number, number, number] | null> = { base: baseRates };
  for (const w of [0.25, 0.5, 0.75, 1]) sources[`open-anchored w=${w}`] = (f) => anchoredBlend(f, cache, "open", w);
  for (const w of [0.5, 1]) sources[`close-anchored w=${w}`] = (f) => anchoredBlend(f, cache, "close", w);
  sources["open-anchored w=1 (power devig)"] = (f) => anchoredBlend(f, cache, "open", 1, "base", "power");
  compare("Market-anchored goal rates (1X2 and O2.5 are set from the price; O1.5, O3.5 and BTTS are tests)", withMarket, sources, "base");
  cache.save();
}

if (part === "anchor-m6") {
  // Does pulling toward the early-week price add anything once the fit already uses market goals?
  const M6 = "m60s20_hl120_reg005_st11";
  const cache = new AnchorCache(`${dir}/../anchored.json`);
  const withMarket = fixtures.filter((f) => f.open && f.openOu && f.v.base && f.v[M6]);
  const sources: Record<string, (f: Fixture) => [number, number, number] | null> = {
    base: baseRates,
    M6: (f) => f.v[M6],
    "base anchored 0.5": (f) => anchoredBlend(f, cache, "open", 0.5, "base"),
  };
  for (const w of [0.25, 0.5, 0.75, 1]) sources[`M6 anchored ${w}`] = (f) => anchoredBlend(f, cache, "open", w, M6);
  compare("Anchoring on top of the market-informed fit (open prices)", withMarket, sources, "M6");
  cache.save();
}

if (part === "custom") {
  const names = (arg("names") ?? "base").split(",");
  const only = arg("divs")?.split(",");
  const fx = fixtures.filter((f) => (!only || only.includes(f.div)) && names.every((n) => f.v[n]));
  compare(`Custom: ${names.join(", ")}${only ? ` (divisions ${only.join(",")})` : ""}`, fx, variantSources(names), names[0]);
}
