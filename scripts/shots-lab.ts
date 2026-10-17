/**
 * Research only: two inputs the model could use, tested walk-forward on
 * ESPN's results (scores plus shots for every game). Nothing here changes
 * the model.
 *
 *   1. shots    for leagues whose archive has no shots today (MLS, Brazil,
 *               Argentina, Liga MX, the UEFA cups), goals-only ratings
 *               against ratings that also read shots on target (the fit's
 *               shotWeight, 0.5 in production where a row carries them).
 *               The Premier League is the control: production already has
 *               shots there.
 *   2. rest     days since each club's previous game in any competition we
 *               have (league, UEFA cups, domestic cups), and whether the
 *               model's chances drift when one side is much more rested.
 *
 * Each fixture is predicted from a fit on games strictly before its day.
 *
 *   npx tsx scripts/shots-lab.ts
 */

import { buildPrediction, type Prediction } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import type { Match, ResultRow } from "../src/lib/types";
import { espnGames, type EspnGame } from "./lib/espn";

const DAY = 86_400_000;
const TRAIN_CAP = 1200;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const toRow = (g: EspnGame, withShots: boolean): ResultRow => ({
  leagueId: g.slug,
  date: g.date,
  homeId: g.home,
  homeName: g.home,
  awayId: g.away,
  awayName: g.away,
  homeGoals: g.hg,
  awayGoals: g.ag,
  ...(withShots && g.hsot !== undefined && g.asot !== undefined ? { homeShotsOnTarget: g.hsot, awayShotsOnTarget: g.asot } : {}),
});

function toMatch(g: EspnGame, code: string): Match {
  return {
    id: `espn:${g.slug}:${g.date}:${g.home}`,
    kickoff: new Date(g.date).toISOString(),
    status: "scheduled",
    league: { id: code, name: code, code },
    home: { id: g.home, name: g.home, shortName: g.home },
    away: { id: g.away, name: g.away, shortName: g.away },
    score: { home: null, away: null },
  } as Match;
}

class Score {
  n = 0; ll = 0; ou = 0; ouN = 0; picks = 0; wins = 0;
  add(p: Prediction, g: EspnGame) {
    const o = g.hg > g.ag ? 0 : g.hg === g.ag ? 1 : 2;
    const probs = [p.markets.home, p.markets.draw, p.markets.away];
    this.n++;
    this.ll += -Math.log(Math.max(1e-6, probs[o]));
    const over = p.markets.over["2.5"];
    if (over !== undefined) {
      this.ouN++;
      this.ou += -Math.log(Math.max(1e-6, g.hg + g.ag > 2.5 ? over : 1 - over));
    }
    if (p.sufficiency.publishable && p.topPick) {
      const r = evaluatePick(p.topPick.market, g.hg, g.ag);
      if (r && r !== "push") {
        this.picks++;
        if (r === "win") this.wins++;
      }
    }
  }
  line(label: string) {
    return `  ${label.padEnd(26)} games ${String(this.n).padStart(4)}   1X2 log loss ${(this.ll / this.n).toFixed(4)}   O/U 2.5 log loss ${(this.ou / Math.max(1, this.ouN)).toFixed(4)}   pick landed ${this.picks ? ((100 * this.wins) / this.picks).toFixed(1) : "—"}% of ${this.picks}`;
  }
}

/** Walk-forward over the last `days` of `target`, trained on `pool` (cups: a 730-day window). */
function walk(
  target: EspnGame[],
  pool: EspnGame[],
  code: string,
  days: number,
  weights: number[],
  windowDays?: number,
  onPrediction?: (g: EspnGame, preds: Prediction[]) => void,
): Score[] {
  const end = Date.now();
  const scores = weights.map(() => new Score());
  const fits = new Map<string, ReturnType<typeof fitLeague>>();
  let i = 0;
  for (const g of target.filter((x) => x.date >= end - days * DAY)) {
    const day = Math.floor(g.date / DAY) * DAY;
    while (i < pool.length && pool[i].date < day) i++;
    let from = Math.max(0, i - TRAIN_CAP);
    while (windowDays && from < i && pool[from].date < day - windowDays * DAY) from++;
    const slice = pool.slice(from, i);
    const preds = weights.map((w, wi) => {
      const rows = slice.map((x) => toRow(x, w > 0));
      const key = `${day}|${w}`;
      let fit = fits.get(key);
      if (!fit) fits.set(key, (fit = fitLeague(rows, { shotWeight: w })));
      const p = buildPrediction(toMatch(g, code), rows, [], { prefit: fit });
      scores[wi].add(p, g);
      return p;
    });
    onPrediction?.(g, preds);
  }
  return scores;
}

async function shots(days: number) {
  console.log("\n1. SHOTS ON TARGET IN THE RATINGS (shotWeight 0 = goals only, production uses 0.5 where shots exist)");
  const weights = [0, 0.3, 0.5, 0.7];
  const groups: { name: string; slugs: string[]; code: string; window?: number }[] = [
    { name: "MLS", slugs: ["usa.1"], code: "mls" },
    { name: "Brasileirão", slugs: ["bra.1"], code: "brasileirao" },
    { name: "Argentina", slugs: ["arg.1"], code: "argentina-liga-profesional" },
    { name: "Liga MX", slugs: ["mex.1"], code: "liga-mx" },
    { name: "UEFA cups (pooled)", slugs: ["uefa.champions", "uefa.europa", "uefa.europa.conf"], code: "champions-league", window: 730 },
    { name: "Premier League (control)", slugs: ["eng.1"], code: "premier-league" },
  ];
  for (const g of groups) {
    const games = (await Promise.all(g.slugs.map((s) => espnGames(s)))).flat().sort((a, b) => a.date - b.date);
    if (games.length < 200) {
      console.log(`\n  ${g.name}: only ${games.length} games, skipped`);
      continue;
    }
    const withSot = games.filter((x) => x.hsot !== undefined).length;
    console.log(`\n  ${g.name} (${games.length} games, ${Math.round((100 * withSot) / games.length)}% with shots on target)`);
    const scores = walk(games, games, g.code, days, weights, g.window);
    weights.forEach((w, i) => console.log(scores[i].line(`shotWeight ${w}`)));
  }
}

async function rest(days: number) {
  console.log("\n2. REST DAYS (any competition), top-five leagues, ratings with shots (0.5)");
  const leagues = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];
  const others = ["uefa.champions", "uefa.europa", "uefa.europa.conf", "eng.fa", "eng.league_cup", "esp.copa_del_rey", "ita.coppa_italia", "ger.dfb_pokal", "fra.coupe_de_france"];
  const all = (await Promise.all([...leagues, ...others].map((s) => espnGames(s)))).flat().sort((a, b) => a.date - b.date);
  const byTeam = new Map<string, number[]>();
  for (const g of all) for (const t of [g.home, g.away]) byTeam.set(t, [...(byTeam.get(t) ?? []), g.date]);
  const restBefore = (team: string, t: number) => {
    const dates = byTeam.get(team) ?? [];
    let prev = -Infinity;
    for (const d of dates) if (d < t - 3600_000) prev = d; else break;
    return Number.isFinite(prev) ? (t - prev) / DAY : 99;
  };
  type Bucket = { n: number; homeP: number; homeW: number; awayP: number; awayW: number; drawP: number; drawW: number };
  const buckets = new Map<string, Bucket>();
  const label = (rh: number, ra: number) => {
    const d = rh - ra;
    if (rh <= 3.5 && ra >= 5.5) return "home played 3 or fewer days ago, away rested";
    if (ra <= 3.5 && rh >= 5.5) return "away played 3 or fewer days ago, home rested";
    if (d <= -2.5) return "home 3+ days less rest (other)";
    if (d >= 2.5) return "away 3+ days less rest (other)";
    return "similar rest";
  };
  for (const slug of leagues) {
    const games = all.filter((g) => g.slug === slug);
    walk(games, games, slug, days, [0.5], undefined, (g, [p]) => {
      const k = label(restBefore(g.home, g.date), restBefore(g.away, g.date));
      const b = buckets.get(k) ?? { n: 0, homeP: 0, homeW: 0, awayP: 0, awayW: 0, drawP: 0, drawW: 0 };
      b.n++;
      b.homeP += p.markets.home; b.drawP += p.markets.draw; b.awayP += p.markets.away;
      if (g.hg > g.ag) b.homeW++; else if (g.hg === g.ag) b.drawW++; else b.awayW++;
      buckets.set(k, b);
    });
  }
  const pc = (a: number, n: number) => `${((100 * a) / n).toFixed(1)}%`;
  for (const [k, b] of [...buckets].sort((a, z) => z[1].n - a[1].n)) {
    console.log(`  ${k.padEnd(46)} ${String(b.n).padStart(4)} games   home win stated ${pc(b.homeP, b.n)} actual ${pc(b.homeW, b.n)}   draw ${pc(b.drawP, b.n)}/${pc(b.drawW, b.n)}   away ${pc(b.awayP, b.n)}/${pc(b.awayW, b.n)}`);
  }
}

/**
 * 3. Straight-win calibration outside the 17 football-data.co.uk divisions:
 * home and away win, stated against landed by band, raw and with the result
 * correction fitted on those divisions (scripts/lib/niche-analyse.ts).
 */
async function calibration(days: number) {
  const corr = { home: { a: 0.084, b: 1.259 }, away: { a: 0.156, b: 1.277 } };
  const plattQ = (c: { a: number; b: number }, p: number) => {
    const q = Math.min(0.999, Math.max(0.001, p));
    return 1 / (1 + Math.exp(-(c.a + c.b * Math.log(q / (1 - q)))));
  };
  console.log("\n3. STRAIGHT WINS STATED 55%+: landed vs stated, raw and corrected");
  const groups: { name: string; slugs: string[]; code: string; window?: number }[] = [
    { name: "MLS", slugs: ["usa.1"], code: "mls" },
    { name: "Brasileirão", slugs: ["bra.1"], code: "brasileirao" },
    { name: "Argentina", slugs: ["arg.1"], code: "argentina-liga-profesional" },
    { name: "Liga MX", slugs: ["mex.1"], code: "liga-mx" },
    { name: "UEFA cups (pooled)", slugs: ["uefa.champions", "uefa.europa", "uefa.europa.conf"], code: "champions-league", window: 730 },
  ];
  for (const grp of groups) {
    const games = (await Promise.all(grp.slugs.map((s) => espnGames(s)))).flat().sort((a, b) => a.date - b.date);
    const raw: { p: number; w: number }[] = [], fixed: { p: number; w: number }[] = [];
    walk(games, games, grp.code, days, [0.5], grp.window, (g, [p]) => {
      for (const [side, prob, won] of [["home", p.markets.home, g.hg > g.ag], ["away", p.markets.away, g.hg < g.ag]] as const) {
        const q = plattQ(corr[side], prob);
        if (prob >= 0.55) raw.push({ p: prob, w: Number(won) });
        if (q >= 0.55) fixed.push({ p: q, w: Number(won) });
      }
    });
    const line = (xs: { p: number; w: number }[]) =>
      xs.length ? `${((100 * xs.reduce((a, x) => a + x.w, 0)) / xs.length).toFixed(1)}% vs ${((100 * xs.reduce((a, x) => a + x.p, 0)) / xs.length).toFixed(1)}% (${xs.length})` : "—";
    console.log(`  ${grp.name.padEnd(20)} raw ${line(raw).padEnd(28)} corrected ${line(fixed)}`);
  }
}

async function main() {
  const days = Number(arg("days") ?? 365);
  const only = arg("only");
  if (!only || only === "shots") await shots(days);
  if (!only || only === "rest") await rest(days);
  if (!only || only === "cal") await calibration(days);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
