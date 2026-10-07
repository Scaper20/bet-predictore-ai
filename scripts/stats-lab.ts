/**
 * Corners, cards, shots and shots on target, tested walk-forward.
 *
 * For every matchday in the scored seasons, each statistic is refitted per
 * competition on matches BEFORE that day only (src/lib/model/match-stats.ts),
 * then every fixture of the day is predicted and graded against the real
 * full-match counts (football-data.co.uk HC/AC, HY/AY + HR/AR, HS/AS,
 * HST/AST).
 *
 * Two yardsticks, both built from the same prior matches:
 *  - climatology: the league's own base rate for each line ("always say the
 *    usual"). A market is only worth publishing if the model beats it.
 *  - team averages: each side's plain average for and against, Poisson, no
 *    opponent adjustment and no spread modelling. Shows what the fuller
 *    model adds over the obvious approach.
 * The source carries no corner, card or shot prices, so there is no value
 * test here; this measures accuracy and calibration only.
 *
 *   npx tsx scripts/stats-lab.ts --from=2223 --to=2627
 *   npx tsx scripts/stats-lab.ts --from=1920 --to=2122 --stat=corners --half=180 --prior=6   (tuning)
 */

import {
  expectStat, fitStat, nbPmf, statGrid, statMarkets, STAT_LINES, STAT_OPTIONS,
  type StatKind, type StatSample,
} from "../src/lib/model/match-stats";
import { csv, DIVISIONS, parse, type Row } from "./lib/football-data-uk";

const SEASONS = ["1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"];
const TRAIN_DAYS = 1000;
const DAY = 86_400_000;

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

const EXTRACT: Record<StatKind, (r: Row) => [number, number]> = {
  corners: (r) => r.stats!.corners,
  cards: (r) => [r.stats!.yellows[0] + r.stats!.reds[0], r.stats!.yellows[1] + r.stats!.reds[1]],
  shots: (r) => r.stats!.shots,
  shotsOnTarget: (r) => r.stats!.shotsOnTarget,
};

class Score {
  n = 0;
  ll = [0, 0, 0]; // model, climatology, team averages
  brier = [0, 0, 0];
  bins = Array.from({ length: 10 }, () => [0, 0, 0]);
  add(probs: number[][], outcome: number) {
    this.n++;
    probs.forEach((p, m) => {
      this.ll[m] += -Math.log(Math.max(1e-9, p[outcome]));
      for (let k = 0; k < p.length; k++) this.brier[m] += (p[k] - (k === outcome ? 1 : 0)) ** 2;
    });
    if (probs[0].length === 2) {
      const p = probs[0][0];
      const b = Math.min(9, Math.floor(p * 10));
      this.bins[b][0] += p;
      this.bins[b][1] += outcome === 0 ? 1 : 0;
      this.bins[b][2]++;
    }
  }
  ece(): number | null {
    if (this.bins.every((b) => b[2] === 0)) return null;
    let e = 0;
    for (const [sp, h, c] of this.bins) if (c) e += (c / this.n) * Math.abs(sp / c - h / c);
    return e;
  }
  line(label: string): string {
    const skill = (m: number) => ((1 - this.ll[m] / this.ll[1]) * 100).toFixed(2);
    const e = this.ece();
    return `${label.padEnd(24)} n=${String(this.n).padStart(6)}  skill vs clim ${skill(0).padStart(6)}%  (team-avg ${skill(2).padStart(6)}%)  Brier ${(this.brier[0] / this.n).toFixed(4)} vs ${(this.brier[1] / this.n).toFixed(4)}${e === null ? "" : `  ECE ${(e * 100).toFixed(2)}pt`}`;
  }
  calibration(): string {
    return this.bins.filter((b) => b[2] >= 60).map(([sp, h, c]) => `${((sp / c) * 100).toFixed(0)}→${((h / c) * 100).toFixed(0)}`).join("  ");
  }
}

class Picks {
  by = new Map<string, { p: number; won: number; n: number; clim: number }>();
  add(bucket: string, p: number, won: boolean, clim: number) {
    const k = this.by.get(bucket) ?? { p: 0, won: 0, n: 0, clim: 0 };
    k.p += p;
    k.won += won ? 1 : 0;
    k.n++;
    k.clim += clim;
    this.by.set(bucket, k);
  }
  report(): string[] {
    return [...this.by].map(
      ([b, k]) =>
        `  ${b.padEnd(34)} picks ${String(k.n).padStart(6)}  claimed ${((k.p / k.n) * 100).toFixed(1)}%  landed ${((k.won / k.n) * 100).toFixed(1)}%  (base rate of those picks ${((k.clim / k.n) * 100).toFixed(1)}%)`,
    );
  }
}

/** Laplace-smoothed frequency. */
const freq = <T,>(xs: T[], f: (x: T) => boolean) => (xs.filter(f).length + 1) / (xs.length + 2);

async function main() {
  const from = arg("from") ?? "2223";
  const to = arg("to") ?? "2627";
  const stats = (arg("stat")?.split(",") as StatKind[] | undefined) ?? (["corners", "cards", "shots", "shotsOnTarget"] as StatKind[]);
  const minPick = Number(arg("min") ?? "0.65");

  for (const stat of stats) {
    const opts = { ...STAT_OPTIONS[stat] };
    if (arg("half")) opts.halfLifeDays = Number(arg("half"));
    if (arg("prior")) opts.prior = Number(arg("prior"));
    if (arg("refPrior")) opts.refereePrior = Number(arg("refPrior"));
    if (arg("beta")) opts.totalShrink = Number(arg("beta"));
    const lines = STAT_LINES[stat];

    const sc = {
      total: new Score(),
      overs: Object.fromEntries(lines.total.map((l) => [String(l), new Score()])) as Record<string, Score>,
      homeTeam: new Score(),
      awayTeam: new Score(),
      result: new Score(),
      handicap: new Score(),
    };
    const picks = new Picks();
    const mae = [0, 0, 0];
    let nMae = 0;
    const ks: number[] = [], rhos: number[] = [];

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
      const withStats = rows.filter((r) => r.stats);
      const samples: StatSample[] = withStats.map((r) => {
        const [h, a] = EXTRACT[stat](r);
        return { date: r.date, home: r.home, away: r.away, h, a, referee: r.referee };
      });
      const startOf = async (season: string) => parse(await csv(season, div), div)[0]?.date ?? Infinity;
      const lo = await startOf(from).catch(() => Infinity);
      const nextIdx = SEASONS.indexOf(to) + 1;
      const hi = nextIdx < SEASONS.length ? await startOf(SEASONS[nextIdx]).catch(() => Infinity) : Infinity;
      const target = samples.filter((s) => s.date >= lo && s.date < hi);

      // Main lines for this league: the ones nearest its median, chosen per day.
      let dayKey = "";
      let fit: ReturnType<typeof fitStat> | undefined;
      let train: StatSample[] = [];
      let climTotal: number[] = [];
      let teamAvg = new Map<string, { f: number; a: number; n: number }>();

      for (const s of target) {
        const day = new Date(s.date).toISOString().slice(0, 10);
        if (day !== dayKey) {
          dayKey = day;
          const start = Date.parse(day);
          train = samples.filter((x) => x.date < start && x.date >= start - TRAIN_DAYS * DAY);
          fit = fitStat(train, start, opts);
          ks.push(Number.isFinite(fit.kTotal) ? fit.kTotal : 999);
          rhos.push(fit.rho);
          // Climatology of the total: smoothed empirical pmf.
          climTotal = new Array(lines.max * 2 + 1).fill(0.5);
          for (const x of train) climTotal[Math.min(climTotal.length - 1, x.h + x.a)]++;
          const z = climTotal.reduce((a, b) => a + b, 0);
          climTotal = climTotal.map((v) => v / z);
          // Plain team averages over the last season-and-a-half.
          teamAvg = new Map();
          for (const x of train.filter((t) => t.date >= start - 540 * DAY)) {
            const h = teamAvg.get(x.home) ?? { f: 0, a: 0, n: 0 };
            h.f += x.h; h.a += x.a; h.n++;
            teamAvg.set(x.home, h);
            const a = teamAvg.get(x.away) ?? { f: 0, a: 0, n: 0 };
            a.f += x.a; a.a += x.h; a.n++;
            teamAvg.set(x.away, a);
          }
        }
        if (!fit || train.length < 200) continue;

        const exp = expectStat(fit, s.home, s.away, s.referee);
        const grid = statGrid(exp, fit, lines.max);
        const m = statMarkets(grid, lines);

        // Team-average baseline.
        const th = teamAvg.get(s.home), ta = teamAvg.get(s.away);
        const avgH = th && ta && th.n >= 5 && ta.n >= 5 ? (th.f / th.n + ta.a / ta.n) / 2 : fit.muH;
        const avgA = th && ta && th.n >= 5 && ta.n >= 5 ? (ta.f / ta.n + th.a / th.n) / 2 : fit.muA;
        const naiveGrid = statGrid({ home: avgH, away: avgA }, { kTotal: Infinity, rho: 0 }, lines.max);
        const nm = statMarkets(naiveGrid, lines);

        const totals = train.map((x) => x.h + x.a);
        const T = s.h + s.a;

        // Whole distribution of the total: log score of the exact count.
        const tp = nbPmf(exp.home + exp.away, fit.kTotal, lines.max * 2);
        const naiveTp = nbPmf(avgH + avgA, Infinity, lines.max * 2);
        const ti = Math.min(lines.max * 2, T);
        sc.total.add([[...tp], climTotal, naiveTp].map((v) => v.map((x) => x || 1e-9)), ti);
        mae[0] += Math.abs(m.expected.total - T);
        mae[1] += Math.abs(totals.reduce((a, b) => a + b, 0) / totals.length - T);
        mae[2] += Math.abs(avgH + avgA - T);
        nMae++;

        for (const l of lines.total) {
          const k = String(l);
          const c = freq(totals, (x) => x > l);
          sc.overs[k].add([[m.over[k], 1 - m.over[k]], [c, 1 - c], [nm.over[k], 1 - nm.over[k]]], T > l ? 0 : 1);
        }
        const tl = lines.team[Math.floor(lines.team.length / 2)];
        const tk = String(tl);
        const ch = freq(train.map((x) => x.h), (x) => x > tl);
        const ca = freq(train.map((x) => x.a), (x) => x > tl);
        sc.homeTeam.add([[m.homeOver[tk], 1 - m.homeOver[tk]], [ch, 1 - ch], [nm.homeOver[tk], 1 - nm.homeOver[tk]]], s.h > tl ? 0 : 1);
        sc.awayTeam.add([[m.awayOver[tk], 1 - m.awayOver[tk]], [ca, 1 - ca], [nm.awayOver[tk], 1 - nm.awayOver[tk]]], s.a > tl ? 0 : 1);
        const cr = [freq(train, (x) => x.h > x.a), freq(train, (x) => x.h === x.a), freq(train, (x) => x.h < x.a)];
        const z = cr[0] + cr[1] + cr[2];
        const res = s.h > s.a ? 0 : s.h === s.a ? 1 : 2;
        sc.result.add([[m.result.home, m.result.draw, m.result.away], cr.map((v) => v / z), [nm.result.home, nm.result.draw, nm.result.away]], res);
        // Handicap -0.5/+0.5 on the favoured side is the result market; score -1.5 home instead.
        const hk = lines.handicap.includes(-1.5) ? "-1.5" : "-0.5";
        const hl = Number(hk);
        const chh = freq(train, (x) => x.h + hl > x.a);
        sc.handicap.add([[m.handicap[hk].home, 1 - m.handicap[hk].home], [chh, 1 - chh], [nm.handicap[hk].home, 1 - nm.handicap[hk].home]], s.h + hl > s.a ? 0 : 1);

        // Picks: the likeliest over/under selection at any total line that
        // clears the bar AND differs from the league's base rate by 8+ points,
        // so a near-certain line ("over 6.5 corners") is never a pick on its own.
        const cands: { label: string; p: number; won: boolean; clim: number }[] = [];
        for (const l of lines.total) {
          const k = String(l);
          const c = freq(totals, (x) => x > l);
          cands.push({ label: `over ${k}`, p: m.over[k], won: T > l, clim: c });
          cands.push({ label: `under ${k}`, p: 1 - m.over[k], won: T < l, clim: 1 - c });
        }
        const best = cands.filter((c) => c.p >= minPick && c.p - c.clim >= 0.08).sort((a, b) => b.p - b.clim - (a.p - a.clim))[0];
        if (best) picks.add(`totals, edge 8pt+ at ${(minPick * 100).toFixed(0)}%+`, best.p, best.won, best.clim);
        const strong = cands.filter((c) => c.p >= 0.75 && c.p - c.clim >= 0.1).sort((a, b) => b.p - a.p)[0];
        if (strong) picks.add("totals, 75%+ and edge 10pt+", strong.p, strong.won, strong.clim);
        const sides = [
          { label: "home most", p: m.result.home, won: s.h > s.a, clim: cr[0] / z },
          { label: "away most", p: m.result.away, won: s.a > s.h, clim: cr[2] / z },
        ].filter((c) => c.p >= minPick);
        for (const c of sides) picks.add(`most ${stat}, ${(minPick * 100).toFixed(0)}%+`, c.p, c.won, c.clim);
      }
    }

    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    console.log(`\n=== ${stat.toUpperCase()}  walk-forward ${from}–${to}, eight leagues  (half-life ${opts.halfLifeDays}d, prior ${opts.prior}, total shrink ${opts.totalShrink}${opts.refereePrior ? `, referee prior ${opts.refereePrior}` : ""})`);
    console.log(`spread: total NB size mean ${mean(ks).toFixed(1)} (999 = Poisson), split rho mean ${mean(rhos).toFixed(3)}`);
    console.log(`total MAE: model ${(mae[0] / nMae).toFixed(3)}  league average ${(mae[1] / nMae).toFixed(3)}  team averages ${(mae[2] / nMae).toFixed(3)}`);
    console.log(sc.total.line("exact total (log score)"));
    for (const [k, s] of Object.entries(sc.overs)) console.log(s.line(`over ${k}`));
    console.log(sc.homeTeam.line(`home over ${lines.team[Math.floor(lines.team.length / 2)]}`));
    console.log(sc.awayTeam.line(`away over ${lines.team[Math.floor(lines.team.length / 2)]}`));
    console.log(sc.result.line("most (3-way)"));
    console.log(sc.handicap.line(`home handicap ${lines.handicap.includes(-1.5) ? "-1.5" : "-0.5"}`));
    console.log("calibration (predicted→observed %, bins of 60+):");
    for (const [k, s] of Object.entries(sc.overs)) console.log(`  over ${k.padEnd(5)} ${s.calibration()}`);
    console.log(`  home ${String(lines.team[Math.floor(lines.team.length / 2)]).padEnd(5)} ${sc.homeTeam.calibration()}`);
    console.log("picks:");
    for (const l of picks.report()) console.log(l);
  }
}

void main();
