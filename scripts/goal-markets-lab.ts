/**
 * The extra goal markets (src/lib/model/goal-markets.ts), tested walk-forward.
 *
 * Same rules as halves-lab.ts: one goals fit per competition per matchday on
 * matches before that day only; every fixture of the day predicted and graded
 * against the real half-time and full-time scores. Scored against
 * climatology (the competition's own base rates over the prior two seasons).
 * No prices in the source for these markets, so no value test.
 *
 *   npx tsx scripts/goal-markets-lab.ts --from=2425 --to=2627
 */

import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { scoreMatrix } from "../src/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT } from "../src/lib/model/halves";
import { goalMarkets } from "../src/lib/model/goal-markets";
import { csv, DIVISIONS, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const SEASONS = ["1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"];
const CLIM_WINDOW = 760;

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

class Score {
  n = 0;
  ll = [0, 0];
  bins = Array.from({ length: 10 }, () => [0, 0, 0]);
  picks = [0, 0, 0]; // claimed sum, won, count at the pick bar
  add(model: number[], clim: number[], outcome: number, minPick: number) {
    this.n++;
    this.ll[0] += -Math.log(Math.max(1e-9, model[outcome]));
    this.ll[1] += -Math.log(Math.max(1e-9, clim[outcome]));
    if (model.length === 2) {
      const p = model[0];
      const b = Math.min(9, Math.floor(p * 10));
      this.bins[b][0] += p;
      this.bins[b][1] += outcome === 0 ? 1 : 0;
      this.bins[b][2]++;
    }
    const best = model.indexOf(Math.max(...model));
    if (model[best] >= minPick) {
      this.picks[0] += model[best];
      this.picks[1] += best === outcome ? 1 : 0;
      this.picks[2]++;
    }
  }
  ece(): string {
    if (this.bins.every((b) => b[2] === 0)) return "";
    let e = 0;
    for (const [sp, h, c] of this.bins) if (c) e += (c / this.n) * Math.abs(sp / c - h / c);
    return `  ECE ${(e * 100).toFixed(2)}pt`;
  }
  line(label: string): string {
    const skill = (1 - this.ll[0] / this.ll[1]) * 100;
    const [cp, w, c] = this.picks;
    const pk = c ? `  picks ${String(c).padStart(5)} claimed ${((cp / c) * 100).toFixed(1)}% landed ${((w / c) * 100).toFixed(1)}%` : "  picks     0";
    return `${label.padEnd(28)} n=${String(this.n).padStart(5)}  skill ${skill.toFixed(2).padStart(6)}%${this.ece().padEnd(15)}${pk}`;
  }
}

async function main() {
  const from = arg("from") ?? "2425";
  const to = arg("to") ?? "2627";
  const minPick = Number(arg("min") ?? "0.65");
  const names = [
    "GG2+ (both score 2+)", "Home over 1.5", "Away over 0.5", "Home win to nil", "Multi-goal 2-3", "Multi-goal 1-3",
    "Exact total (7-way)", "Odd total", "Euro handicap home -1", "Result & BTTS (5-way)", "Result & over 2.5 (5-way)",
    "2H result", "1H handicap home -0.5", "1H handicap home +0.5", "Home wins either half", "Away wins either half",
    "Home wins both halves", "Home scores both halves", "Away scores both halves", "Goal in both halves",
    "Both halves under 1.5", "BTTS 2nd half", "Home scores 1st half", "Away scores 2nd half",
  ];
  const sc = Object.fromEntries(names.map((n) => [n, new Score()])) as Record<string, Score>;

  for (const div of Object.keys(DIVISIONS)) {
    const rows: Row[] = [];
    for (const s of SEASONS) {
      try {
        rows.push(...parse(await csv(s, div), div));
      } catch {
        // not published
      }
    }
    rows.sort((a, b) => a.date - b.date);
    const startOf = async (season: string) => parse(await csv(season, div), div)[0]?.date ?? Infinity;
    const lo = await startOf(from);
    const nextIdx = SEASONS.indexOf(to) + 1;
    const hi = nextIdx < SEASONS.length ? await startOf(SEASONS[nextIdx]).catch(() => Infinity) : Infinity;
    const target = rows.filter((r) => r.date >= lo && r.date < hi && r.htHome !== undefined);

    let dayKey = "";
    let prior: ReturnType<typeof toResultRow>[] = [];
    let prefit: ReturnType<typeof fitLeague> | undefined;
    let recent: Row[] = [];
    // Climatology probabilities per market, recomputed per matchday.
    let clim: Record<string, number[]> = {};

    // Outcome index per market for a finished row (the order the model probs use).
    const outcomes = (r: Row): Record<string, number> => {
      const x = r.homeGoals, y = r.awayGoals, t = x + y;
      const hx = r.htHome!, hy = r.htAway!, sx = x - hx, sy = y - hy;
      const res = (a: number, b: number) => (a > b ? 0 : a === b ? 1 : 2);
      const bin = (c: boolean) => (c ? 0 : 1);
      const btts = x > 0 && y > 0;
      return {
        "GG2+ (both score 2+)": bin(x >= 2 && y >= 2),
        "Home over 1.5": bin(x > 1.5),
        "Away over 0.5": bin(y > 0.5),
        "Home win to nil": bin(x > y && y === 0),
        "Multi-goal 2-3": bin(t >= 2 && t <= 3),
        "Multi-goal 1-3": bin(t >= 1 && t <= 3),
        "Exact total (7-way)": Math.min(6, t),
        "Odd total": bin(t % 2 === 1),
        "Euro handicap home -1": res(x - 1, y),
        "Result & BTTS (5-way)": x > y ? (btts ? 0 : 1) : x < y ? (btts ? 2 : 3) : btts ? 4 : 5,
        "Result & over 2.5 (5-way)": x > y ? (t > 2.5 ? 0 : 1) : x < y ? (t > 2.5 ? 2 : 3) : t > 2.5 ? 4 : 5,
        "2H result": res(sx, sy),
        "1H handicap home -0.5": bin(hx > hy),
        "1H handicap home +0.5": bin(hx >= hy),
        "Home wins either half": bin(hx > hy || sx > sy),
        "Away wins either half": bin(hy > hx || sy > sx),
        "Home wins both halves": bin(hx > hy && sx > sy),
        "Home scores both halves": bin(hx > 0 && sx > 0),
        "Away scores both halves": bin(hy > 0 && sy > 0),
        "Goal in both halves": bin(hx + hy > 0 && sx + sy > 0),
        "Both halves under 1.5": bin(hx + hy < 2 && sx + sy < 2),
        "BTTS 2nd half": bin(sx > 0 && sy > 0),
        "Home scores 1st half": bin(hx > 0),
        "Away scores 2nd half": bin(sy > 0),
      };
    };
    const sizes: Record<string, number> = { "Exact total (7-way)": 7, "Euro handicap home -1": 3, "Result & BTTS (5-way)": 6, "Result & over 2.5 (5-way)": 6, "2H result": 3 };

    for (const row of target) {
      const day = new Date(row.date).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        const start = Date.parse(day);
        const priorRows = rows.filter((r) => r.date < start);
        prior = priorRows.map(toResultRow);
        prefit = fitLeague(prior, undefined);
        recent = priorRows.filter((r) => r.htHome !== undefined).slice(-CLIM_WINDOW);
        clim = {};
        for (const name of names) {
          const k = sizes[name] ?? 2;
          const counts = new Array(k).fill(1);
          for (const r of recent) counts[outcomes(r)[name]]++;
          const z = counts.reduce((a, b) => a + b, 0);
          clim[name] = counts.map((c) => c / z);
        }
      }

      const p = buildPrediction(toMatch(row, DIVISIONS[div]), prior, [], { prefit });
      const { home: lam, away: mu } = p.markets.expectedGoals;
      const g = goalMarkets(scoreMatrix(lam, mu, p.model.rho), halfGrids(lam, mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT));
      const two = (q: number) => [q, 1 - q];
      const ht = (r: { home: number; away: number; push: number }) => two(r.home);
      const model: Record<string, number[]> = {
        "GG2+ (both score 2+)": two(g.gg2),
        "Home over 1.5": two(g.homeOver["1.5"]),
        "Away over 0.5": two(g.awayOver["0.5"]),
        "Home win to nil": two(g.winToNil.home),
        "Multi-goal 2-3": two(g.multiGoal["2-3"]),
        "Multi-goal 1-3": two(g.multiGoal["1-3"]),
        "Exact total (7-way)": ["0", "1", "2", "3", "4", "5", "6+"].map((k) => g.exactTotal[k]),
        "Odd total": two(g.odd),
        "Euro handicap home -1": [g.euroHandicap["-1"].home, g.euroHandicap["-1"].draw, g.euroHandicap["-1"].away],
        "Result & BTTS (5-way)": [g.resultBtts.homeYes, g.resultBtts.homeNo, g.resultBtts.awayYes, g.resultBtts.awayNo, g.resultBtts.drawYes,
          Math.max(1e-6, 1 - g.resultBtts.homeYes - g.resultBtts.homeNo - g.resultBtts.awayYes - g.resultBtts.awayNo - g.resultBtts.drawYes)],
        "Result & over 2.5 (5-way)": [g.resultOver25.homeOver, g.resultOver25.homeUnder, g.resultOver25.awayOver, g.resultOver25.awayUnder, g.resultOver25.drawOver,
          Math.max(1e-6, 1 - g.resultOver25.homeOver - g.resultOver25.homeUnder - g.resultOver25.awayOver - g.resultOver25.awayUnder - g.resultOver25.drawOver)],
        "2H result": [g.secondHalf.home, g.secondHalf.draw, g.secondHalf.away],
        "1H handicap home -0.5": ht(g.firstHalfHandicap["-0.5"]),
        "1H handicap home +0.5": ht(g.firstHalfHandicap["+0.5"]),
        "Home wins either half": two(g.winEitherHalf.home),
        "Away wins either half": two(g.winEitherHalf.away),
        "Home wins both halves": two(g.winBothHalves.home),
        "Home scores both halves": two(g.scoreBothHalves.home),
        "Away scores both halves": two(g.scoreBothHalves.away),
        "Goal in both halves": two(g.bothHalvesOver05),
        "Both halves under 1.5": two(g.bothHalvesUnder15),
        "BTTS 2nd half": two(g.bttsSecondHalf),
        "Home scores 1st half": two(g.homeScores.first),
        "Away scores 2nd half": two(g.awayScores.second),
      };
      const out = outcomes(row);
      for (const name of names) sc[name].add(model[name], clim[name], out[name], minPick);
    }
  }

  console.log(`GOAL MARKETS, walk-forward ${from}–${to}, eight leagues (fit only on prior matches; picks = likeliest selection at ${(minPick * 100).toFixed(0)}%+)\n`);
  for (const name of names) console.log(sc[name].line(name));
}

void main();
