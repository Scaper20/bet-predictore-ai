/**
 * Improvement search: cheap shape corrections applied to a recorded variant's
 * rates, no refit. Scales the low-score parameter (rho) and the total goals.
 *
 *   npx tsx scripts/improve-shape.ts --dir=<lab dirs, comma separated> [--variant=base]
 */
import { fmt, fmtDiff, inWindow, ll, loadLab, meanSe, probsOf, result3, type Fixture } from "./lib/improve-core";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const variant = arg("variant") ?? "base";
const fx = loadLab((arg("dir") ?? "/tmp/lab").split(",")).filter((f) => f.v[variant]);
const M: Record<string, (f: Fixture, p: ReturnType<typeof probsOf>) => number> = {
  "1X2": (f, p) => ll([p.home, p.draw, p.away][result3(f)]),
  "O1.5": (f, p) => ll(f.hg + f.ag > 1.5 ? p.o15 : 1 - p.o15),
  "O2.5": (f, p) => ll(f.hg + f.ag > 2.5 ? p.o25 : 1 - p.o25),
  "O3.5": (f, p) => ll(f.hg + f.ag > 3.5 ? p.o35 : 1 - p.o35),
  BTTS: (f, p) => ll(f.hg > 0 && f.ag > 0 ? p.btts : 1 - p.btts),
};
const combos: [string, number, number][] = [["as is", 1, 1], ["rho x0", 0, 1], ["rho x0.5", 0.5, 1], ["rho x1.5", 1.5, 1], ["goals x1.01", 1, 1.01], ["goals x1.02", 1, 1.02], ["goals x0.99", 1, 0.99], ["rho x0.5, goals x1.01", 0.5, 1.01], ["rho x0.5, goals x1.02", 0.5, 1.02]];
console.log(`variant ${variant}`);
for (const w of ["DEV", "HELD", "OWNER"]) {
  const sub = inWindow(fx, w);
  console.log(`\n${w}: ${sub.length} fixtures`);
  console.log("change".padEnd(24) + Object.keys(M).map((k) => k.padStart(24)).join(""));
  const base: Record<string, number[]> = {};
  for (const [name, rm, gm] of combos) {
    const cells = Object.entries(M).map(([k, fn]) => {
      const vals = sub.map((f) => { const [l, m, r] = f.v[variant]; return fn(f, probsOf(l * gm, m * gm, r * rm)); });
      if (name === "as is") { base[k] = vals; return fmt(meanSe(vals)).padStart(24); }
      return `${fmt(meanSe(vals))} ${fmtDiff(meanSe(vals.map((v, i) => v - base[k][i])), 4)}`.padStart(24);
    });
    console.log(name.padEnd(24) + cells.join(""));
  }
}
