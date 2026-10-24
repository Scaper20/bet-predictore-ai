/**
 * Research only: is the goal-timing estimate (src/lib/model/lead-process.ts)
 * honest? It prices 1UP, 2UP, lead by N, first goal and the like, and nothing
 * had ever checked it against results.
 *
 * For each league game in football-data.co.uk's files from July 2024, the
 * closing 1X2 and over/under 2.5 prices (margin out) are turned into the two
 * sides' expected goals, so the test is of the timing process alone, not of
 * our goals model. ESPN's play list gives when each goal came
 * (archive/espn-shots.ts); each market is graded on it by the same rules the
 * estimate prices with (landedOn), and the estimate's chances are compared
 * with how often they landed: overall, and in 10-point buckets.
 *
 *   npx tsx scripts/lead-lab.ts [season ...]     (default 2425 2526 2627)
 */
import { ESPN_GOAL_LEAGUES, espnDay, matchGoals, type EspnResult } from "../src/lib/archive/espn-shots";
import { deVig } from "../src/lib/model/backtest";
import { halfRates, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "../src/lib/model/halves";
import { landedOn, leadChance } from "../src/lib/model/lead-process";
import type { SportyBetSelection } from "../src/lib/odds/markets";
import { csv, parse, type Row } from "./lib/football-data-uk";

const DIVS: Record<string, string> = {
  E0: "premier-league", E1: "championship", SP1: "la-liga", I1: "serie-a", D1: "bundesliga", F1: "ligue-1",
  N1: "eredivisie", P1: "primeira-liga", SC0: "scottish-premiership", B1: "belgian-pro-league", T1: "super-lig",
  G1: "greek-super-league", E2: "league-one", D2: "bundesliga-2", I2: "serie-b", SP2: "la-liga-2", F2: "ligue-2",
};
const FROM = Date.UTC(2024, 6, 1);
const CONCURRENCY = 6;

const MARKETS: { name: string; sel: SportyBetSelection }[] = [
  { name: "1UP home", sel: { marketId: "60200", outcomeId: "1" } },
  { name: "1UP away", sel: { marketId: "60200", outcomeId: "3" } },
  { name: "2UP home", sel: { marketId: "60100", outcomeId: "1" } },
  { name: "2UP away", sel: { marketId: "60100", outcomeId: "3" } },
  { name: "DC 1UP home/draw", sel: { marketId: "60110", outcomeId: "9" } },
  { name: "DC 1UP draw/away", sel: { marketId: "60110", outcomeId: "11" } },
  { name: "any lead by 2", sel: { marketId: "60301", outcomeId: "74" } },
  { name: "home win from behind", sel: { marketId: "900383", outcomeId: "74" } },
  { name: "any 2 in a row", sel: { marketId: "60010", outcomeId: "74" } },
  { name: "first goal home", sel: { marketId: "8", outcomeId: "6", specifier: "goalnr=1" } },
  { name: "first goal 1-15", sel: { marketId: "100", outcomeId: "584", specifier: "goalnr=1" } },
  { name: "1H first goal none", sel: { marketId: "62", outcomeId: "7", specifier: "goalnr=1" } },
  { name: "over 0.5 by 25'", sel: { marketId: "900313", outcomeId: "30", specifier: "minute=25|total=0.5" } },
];

/** Poisson P(X = k) for k = 0..10. */
function pmf(l: number): number[] {
  const out = [Math.exp(-l)];
  for (let k = 1; k <= 10; k++) out.push((out[k - 1] * l) / k);
  return out;
}

/** The expected goals pair whose Poisson grid best matches the margin-free 1X2 and over 2.5: coarse, then fine. */
function fitRates(home: number, draw: number, over: number | null): [number, number] {
  const err = (l: number, m: number) => {
    const a = pmf(l);
    const b = pmf(m);
    let h = 0, d = 0, o = 0;
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = a[i] * b[j];
      if (i > j) h += p;
      else if (i === j) d += p;
      if (i + j > 2.5) o += p;
    }
    return (h - home) ** 2 + (d - draw) ** 2 + (over === null ? 0 : (o - over) ** 2);
  };
  let best: [number, number] = [1.4, 1.1];
  let e = Infinity;
  const search = (l0: number, l1: number, m0: number, m1: number, step: number) => {
    for (let l = l0; l <= l1; l += step) for (let m = m0; m <= m1; m += step) {
      const x = err(l, m);
      if (x < e) {
        e = x;
        best = [l, m];
      }
    }
  };
  search(0.2, 4, 0.2, 3.5, 0.1);
  const [l, m] = best;
  search(Math.max(0.05, l - 0.1), l + 0.1, Math.max(0.05, m - 0.1), m + 0.1, 0.01);
  return best;
}

async function espnFor(slug: string, rows: Row[]): Promise<EspnResult[]> {
  const days = new Set<string>();
  for (const r of rows) {
    days.add(new Date(r.date).toISOString().slice(0, 10));
    days.add(new Date(r.date + 86_400_000).toISOString().slice(0, 10));
  }
  const queue = [...days];
  const out: EspnResult[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) out.push(...(await espnDay(slug, new Date(`${d}T12:00:00Z`)).catch(() => [])));
    }),
  );
  return out;
}

async function main() {
  const seasons = process.argv.slice(2).length ? process.argv.slice(2) : ["2425", "2526", "2627"];
  const tally = new Map(MARKETS.map((m) => [m.name, { n: 0, p: 0, hit: 0, brier: 0, base: 0, buckets: new Map<number, { n: number; p: number; hit: number }>() }]));
  let games = 0;
  let htAgree = 0;
  let htSeen = 0;
  for (const [div, code] of Object.entries(DIVS)) {
    const rows: Row[] = [];
    for (const s of seasons) rows.push(...parse(await csv(s, div).catch(() => ""), div).filter((r) => r.date >= FROM && r.close));
    if (!rows.length) continue;
    const espn = await espnFor(ESPN_GOAL_LEAGUES[code], rows);
    const keyed = rows.map((r, i) => ({ id: String(i), kickoff: r.date + 15 * 3600_000, home: r.home, away: r.away, hg: r.homeGoals, ag: r.awayGoals }));
    const timelines = matchGoals(espn, keyed);
    console.error(`${div.padEnd(4)} ${rows.length} games, ${timelines.length} timelines`);
    for (const t of timelines) {
      const r = rows[Number(t.id)];
      if (r.htHome !== undefined && r.htAway !== undefined) {
        htSeen++;
        if (r.htHome === t.htHome && r.htAway === t.htAway) htAgree++;
      }
      const [home, draw] = deVig([r.close!.home, r.close!.draw, r.close!.away]);
      const over = r.closeOu ? deVig([r.closeOu.over, r.closeOu.under])[0] : null;
      const [l, m] = fitRates(home, draw, over);
      const rates = halfRates(l, m, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT, SITE_SECOND_HALF_TILT);
      games++;
      for (const mk of MARKETS) {
        const p = leadChance(mk.sel, rates)!;
        const hit = landedOn(mk.sel, t.goals) ? 1 : 0;
        const x = tally.get(mk.name)!;
        x.n++;
        x.p += p;
        x.hit += hit;
        x.brier += (p - hit) ** 2;
        const b = Math.min(9, Math.floor(p * 10));
        const bucket = x.buckets.get(b) ?? { n: 0, p: 0, hit: 0 };
        bucket.n++;
        bucket.p += p;
        bucket.hit += hit;
        x.buckets.set(b, bucket);
      }
    }
  }
  console.log(`${games} games; ESPN's half-time score agrees with football-data's on ${((htAgree / Math.max(1, htSeen)) * 100).toFixed(1)}% of ${htSeen}\n`);
  console.log("market                  n      said   landed   Brier   v base   worst bucket (n>=100)");
  for (const [name, x] of tally) {
    const rate = x.hit / x.n;
    const base = rate * (1 - rate);
    let worst = "";
    let gap = 0;
    for (const [b, v] of x.buckets) {
      if (v.n < 100) continue;
      const d = v.hit / v.n - v.p / v.n;
      if (Math.abs(d) > Math.abs(gap)) {
        gap = d;
        worst = `${b * 10}-${b * 10 + 10}%: said ${((v.p / v.n) * 100).toFixed(1)}, landed ${((v.hit / v.n) * 100).toFixed(1)} (n ${v.n})`;
      }
    }
    console.log(
      `${name.padEnd(22)} ${String(x.n).padStart(5)}  ${((x.p / x.n) * 100).toFixed(1).padStart(6)}%  ${(rate * 100).toFixed(1).padStart(6)}%  ${(x.brier / x.n).toFixed(4)}  ${(x.brier / x.n - base >= 0 ? "+" : "")}${(x.brier / x.n - base).toFixed(4)}   ${worst}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
