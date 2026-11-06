/**
 * Training rows with the goals the market's closing prices implied for each
 * game attached (ResultRow.homeMkt / awayMkt, FitOptions.mktWeight). Solved once
 * per game and cached next to the other lab caches.
 */
import fs from "node:fs";
import path from "node:path";
import { fair3, fairOu, impliedRates } from "./improve-core";
import { toResultRow, type Row } from "./football-data-uk";

export function mktRows(div: string, cacheDir: string): { rr: (r: Row) => ReturnType<typeof toResultRow>; save: () => void } {
  const file = path.join(cacheDir, `mkt-${div}.json`);
  const cache: Record<string, [number, number]> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  let dirty = false;
  const rr = (r: Row) => {
    const base = toResultRow(r);
    if (!r.close || !r.closeOu) return base;
    const k = `${r.date}|${r.home}|${r.away}`;
    let m = cache[k];
    if (!m) {
      const [pH, , pA] = fair3(r.close);
      m = impliedRates(pH, pA, fairOu(r.closeOu), -0.07, [1.45, 1.15]);
      cache[k] = m;
      dirty = true;
    }
    return { ...base, homeMkt: m[0], awayMkt: m[1] };
  };
  return { rr, save: () => { if (dirty) fs.writeFileSync(file, JSON.stringify(cache)); } };
}
