/**
 * Half-time and second-half markets, tested walk-forward before release.
 *
 * Same rules as model-lab.ts: one fit per competition per matchday on
 * matches before that day only, then every fixture of the day predicted and
 * graded against the real half-time and full-time scores
 * (football-data.co.uk HTHG/HTAG). The first-half goal share is measured
 * from the same prior matches, never from the season being scored.
 *
 * Scored against climatology (the competition's own base rates from the
 * same prior matches): a market is only worth publishing if the model beats
 * "always say the usual". The full-match 1X2, where the model is known to be
 * about level with the closing market, is scored the same way as a yardstick.
 * The source carries no half-time prices, so there is no value test; this
 * measures accuracy and calibration only.
 *
 *   npx tsx scripts/halves-lab.ts --from=2526 --to=2627
 */

import { buildPrediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { firstHalfShare, halfMarkets } from "../src/lib/model/halves";
import { csv, DIVISIONS, parse, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const SEASONS = ["2223", "2324", "2425", "2526", "2627"];
const SHARE_WINDOW = 760; // about two seasons of a 20-team league

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

/** One market's scorecard: log loss for the model and climatology, plus calibration bins. */
class Score {
  n = 0;
  llModel = 0;
  llClim = 0;
  brierModel = 0;
  brierClim = 0;
  /** For binary markets: bins of [sum predicted, hits, count]. */
  bins = Array.from({ length: 10 }, () => [0, 0, 0]);

  add(model: number[], clim: number[], outcome: number) {
    this.n++;
    this.llModel += -Math.log(Math.max(1e-9, model[outcome]));
    this.llClim += -Math.log(Math.max(1e-9, clim[outcome]));
    for (let k = 0; k < model.length; k++) {
      const y = k === outcome ? 1 : 0;
      this.brierModel += (model[k] - y) ** 2;
      this.brierClim += (clim[k] - y) ** 2;
    }
    if (model.length === 2) {
      const p = model[0];
      const b = Math.min(9, Math.floor(p * 10));
      this.bins[b][0] += p;
      this.bins[b][1] += outcome === 0 ? 1 : 0;
      this.bins[b][2]++;
    }
  }

  /** Expected calibration error, binary markets only. */
  ece(): number | null {
    if (this.bins.every((b) => b[2] === 0)) return null;
    let e = 0;
    for (const [sp, hits, c] of this.bins) if (c) e += (c / this.n) * Math.abs(sp / c - hits / c);
    return e;
  }

  line(label: string): string {
    const skill = 1 - this.llModel / this.llClim;
    const ece = this.ece();
    return (
      `${label.padEnd(26)} n=${String(this.n).padStart(5)}  LL ${(this.llModel / this.n).toFixed(4)} vs clim ${(this.llClim / this.n).toFixed(4)}` +
      `  skill ${(skill * 100).toFixed(2)}%  Brier ${(this.brierModel / this.n).toFixed(4)} vs ${(this.brierClim / this.n).toFixed(4)}` +
      (ece === null ? "" : `  ECE ${(ece * 100).toFixed(2)}pt`)
    );
  }

  calibration(): string {
    return this.bins
      .filter((b) => b[2] >= 30)
      .map(([sp, hits, c]) => `${((sp / c) * 100).toFixed(0)}%→${((hits / c) * 100).toFixed(0)}% (${c})`)
      .join("  ");
  }
}

/** Headline-style picks: the likeliest half selection per fixture, if at least `min`. */
class Picks {
  rows: { market: string; p: number; won: boolean }[] = [];
  add(market: string, p: number, won: boolean) {
    this.rows.push({ market, p, won });
  }
  report(): string[] {
    const out: string[] = [];
    const by = new Map<string, { p: number; won: number; n: number }>();
    for (const r of this.rows) {
      const k = by.get(r.market) ?? { p: 0, won: 0, n: 0 };
      k.p += r.p;
      k.won += r.won ? 1 : 0;
      k.n++;
      by.set(r.market, k);
    }
    for (const [m, k] of [...by].sort((a, b) => b[1].n - a[1].n)) {
      out.push(`  ${m.padEnd(22)} picks ${String(k.n).padStart(5)}  claimed ${((k.p / k.n) * 100).toFixed(1)}%  landed ${((k.won / k.n) * 100).toFixed(1)}%`);
    }
    const all = this.rows;
    if (all.length) {
      const p = all.reduce((s, r) => s + r.p, 0) / all.length;
      const w = all.filter((r) => r.won).length / all.length;
      out.push(`  ${"ALL".padEnd(22)} picks ${String(all.length).padStart(5)}  claimed ${(p * 100).toFixed(1)}%  landed ${(w * 100).toFixed(1)}%`);
    }
    return out;
  }
}

function rate(rows: Row[], f: (r: Row) => boolean): number {
  const usable = rows.filter((r) => r.htHome !== undefined);
  if (usable.length === 0) return 0.5;
  // Laplace-smoothed so a rare outcome never gets probability zero.
  return (usable.filter(f).length + 1) / (usable.length + 2);
}

async function main() {
  const from = arg("from") ?? "2526";
  const to = arg("to") ?? "2627";
  const minPick = Number(arg("min") ?? "0.6");
  // --share=0.443: one fixed first-half share for every league, as the site
  // would use without half-time scores stored per competition.
  const fixedShare = arg("share") ? Number(arg("share")) : null;
  const tilt = Number(arg("tilt") ?? "0");

  const scores = {
    ft1x2: new Score(),
    ht1x2: new Score(),
    htDraw: new Score(),
    htHome: new Score(),
    htO05: new Score(),
    htO15: new Score(),
    shO05: new Score(),
    shO15: new Score(),
    btts1h: new Score(),
    highest: new Score(),
    htft: new Score(),
  };
  const picks = new Picks();
  const shares: number[] = [];

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
    const target = rows.filter((r) => r.date >= lo && r.date < hi && r.htHome !== undefined && r.htAway !== undefined);

    let dayKey = "";
    let priorRows: Row[] = [];
    let prior: ReturnType<typeof toResultRow>[] = [];
    let prefit: ReturnType<typeof fitLeague> | undefined;
    let share = { home: 0.44, away: 0.44 };
    let clim = { ht: [0, 0, 0], ft: [0, 0, 0], htO05: 0, htO15: 0, shO05: 0, shO15: 0, btts1h: 0, hi: [0, 0, 0], htft: {} as Record<string, number> };

    for (const row of target) {
      const day = new Date(row.date).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        const dayStart = Date.parse(day);
        priorRows = rows.filter((r) => r.date < dayStart);
        prior = priorRows.map(toResultRow);
        prefit = fitLeague(prior, undefined);
        const recent = priorRows.slice(-SHARE_WINDOW);
        share = fixedShare ? { home: fixedShare, away: fixedShare } : firstHalfShare(recent);
        shares.push((share.home + share.away) / 2);
        const R = (x: number, y: number) => (x > y ? "H" : x === y ? "D" : "A");
        const htftKeys = ["H/H", "H/D", "H/A", "D/H", "D/D", "D/A", "A/H", "A/D", "A/A"];
        const usable = recent.filter((r) => r.htHome !== undefined);
        const htftCounts = Object.fromEntries(htftKeys.map((k) => [k, 1]));
        for (const r of usable) htftCounts[`${R(r.htHome!, r.htAway!)}/${R(r.homeGoals, r.awayGoals)}`]++;
        const tot = usable.length + htftKeys.length;
        clim = {
          ht: [rate(recent, (r) => r.htHome! > r.htAway!), rate(recent, (r) => r.htHome === r.htAway), rate(recent, (r) => r.htHome! < r.htAway!)],
          ft: [rate(recent, (r) => r.homeGoals > r.awayGoals), rate(recent, (r) => r.homeGoals === r.awayGoals), rate(recent, (r) => r.homeGoals < r.awayGoals)],
          htO05: rate(recent, (r) => r.htHome! + r.htAway! > 0.5),
          htO15: rate(recent, (r) => r.htHome! + r.htAway! > 1.5),
          shO05: rate(recent, (r) => r.homeGoals + r.awayGoals - r.htHome! - r.htAway! > 0.5),
          shO15: rate(recent, (r) => r.homeGoals + r.awayGoals - r.htHome! - r.htAway! > 1.5),
          btts1h: rate(recent, (r) => r.htHome! > 0 && r.htAway! > 0),
          hi: (() => {
            const f = (r: Row) => r.htHome! + r.htAway!;
            const s = (r: Row) => r.homeGoals + r.awayGoals - f(r);
            return [rate(recent, (r) => f(r) > s(r)), rate(recent, (r) => f(r) < s(r)), rate(recent, (r) => f(r) === s(r))];
          })(),
          htft: Object.fromEntries(htftKeys.map((k) => [k, htftCounts[k] / tot])),
        };
        const norm = (v: number[]) => v.map((x) => x / v.reduce((a, b) => a + b, 0));
        clim.ht = norm(clim.ht);
        clim.ft = norm(clim.ft);
        clim.hi = norm(clim.hi);
      }

      const p = buildPrediction(toMatch(row, DIVISIONS[div]), prior, [], { prefit });
      const { home: lam, away: mu } = p.markets.expectedGoals;
      const h = halfMarkets(lam, mu, share, tilt);

      const htH = row.htHome!, htA = row.htAway!;
      const shGoals = row.homeGoals + row.awayGoals - htH - htA;
      const htGoals = htH + htA;
      const res = (x: number, y: number) => (x > y ? 0 : x === y ? 1 : 2);
      const bin = (pOver: number, cOver: number, over: boolean, s: Score) => s.add([pOver, 1 - pOver], [cOver, 1 - cOver], over ? 0 : 1);

      scores.ft1x2.add([p.markets.home, p.markets.draw, p.markets.away], clim.ft, res(row.homeGoals, row.awayGoals));
      scores.ht1x2.add([h.ht.home, h.ht.draw, h.ht.away], clim.ht, res(htH, htA));
      bin(h.ht.draw, clim.ht[1], htH === htA, scores.htDraw);
      bin(h.ht.home, clim.ht[0], htH > htA, scores.htHome);
      bin(h.htOver["0.5"], clim.htO05, htGoals > 0.5, scores.htO05);
      bin(h.htOver["1.5"], clim.htO15, htGoals > 1.5, scores.htO15);
      bin(h.shOver["0.5"], clim.shO05, shGoals > 0.5, scores.shO05);
      bin(h.shOver["1.5"], clim.shO15, shGoals > 1.5, scores.shO15);
      bin(h.bttsFirstHalf, clim.btts1h, htH > 0 && htA > 0, scores.btts1h);
      scores.highest.add(
        [h.highestHalf.first, h.highestHalf.second, h.highestHalf.equal],
        clim.hi,
        htGoals > shGoals ? 0 : htGoals < shGoals ? 1 : 2,
      );
      const keys = Object.keys(h.htft);
      const R = (x: number, y: number) => (x > y ? "H" : x === y ? "D" : "A");
      const actual = `${R(htH, htA)}/${R(row.homeGoals, row.awayGoals)}`;
      scores.htft.add(keys.map((k) => h.htft[k]), keys.map((k) => clim.htft[k]), keys.indexOf(actual));

      // Pick candidates: every half selection the product could publish.
      const cands: [string, number, boolean][] = [
        ["HT home", h.ht.home, htH > htA],
        ["HT draw", h.ht.draw, htH === htA],
        ["HT away", h.ht.away, htH < htA],
        ["HT over 0.5", h.htOver["0.5"], htGoals > 0.5],
        ["HT under 1.5", 1 - h.htOver["1.5"], htGoals < 1.5],
        ["HT over 1.5", h.htOver["1.5"], htGoals > 1.5],
        ["2H over 0.5", h.shOver["0.5"], shGoals > 0.5],
        ["2H over 1.5", h.shOver["1.5"], shGoals > 1.5],
        ["2H under 1.5", 1 - h.shOver["1.5"], shGoals < 1.5],
        ["Highest half: 2nd", h.highestHalf.second, shGoals > htGoals],
      ];
      // Like the site: the likeliest selection that clears the bar, ignoring
      // near-certainties no one would price (over 0.5 in the second half sits
      // near 75% almost everywhere, so it is a pick only above the bar).
      const best = cands.filter((c) => c[1] >= minPick).sort((a, b) => b[1] - a[1])[0];
      if (best) picks.add(best[0], best[1], best[2]);
    }
  }

  console.log(`HALF MARKETS, walk-forward ${from}–${to}, eight leagues (fit only on prior matches)\n`);
  console.log(`first-half goal share used: mean ${((shares.reduce((a, b) => a + b, 0) / shares.length) * 100).toFixed(1)}%\n`);
  console.log(scores.ft1x2.line("FT 1X2 (yardstick)"));
  console.log(scores.ht1x2.line("HT 1X2"));
  console.log(scores.htDraw.line("  HT draw (binary)"));
  console.log(scores.htHome.line("  HT home (binary)"));
  console.log(scores.htO05.line("HT over 0.5"));
  console.log(scores.htO15.line("HT over 1.5"));
  console.log(scores.shO05.line("2H over 0.5"));
  console.log(scores.shO15.line("2H over 1.5"));
  console.log(scores.btts1h.line("BTTS first half"));
  console.log(scores.highest.line("Highest scoring half"));
  console.log(scores.htft.line("HT/FT (9-way)"));
  console.log("\nCALIBRATION (predicted → observed, bins of 30+)");
  for (const [k, s] of Object.entries(scores)) {
    const c = s.calibration();
    if (c) console.log(`  ${k.padEnd(10)} ${c}`);
  }
  console.log(`\nPICKS: likeliest half selection per fixture at ${(minPick * 100).toFixed(0)}%+`);
  for (const l of picks.report()) console.log(l);
}

void main();
