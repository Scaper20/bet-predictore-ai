/**
 * Walk-forward backtest of the live prediction pipeline.
 *
 * For every fixture in the evaluation window: fit on the completed matches
 * that existed *before* its kickoff, build a prediction through the same
 * buildPrediction() the site calls, take the same topPick the site would
 * publish, and grade it with the same evaluatePick() the settlement cron uses.
 * Nothing is reimplemented, so what this measures is the shipped model rather
 * than a sketch of it.
 *
 * Data: football-data.co.uk. Chosen because it needs no key (the repo has no
 * football-data.org or API-Football token, and TheSportsDB's free key
 * truncates every season endpoint to five rows, so neither configured
 * provider can serve a backtest at all), it carries full completed seasons,
 * and — the part that matters most — it carries CLOSING prices. A hit rate
 * without a price beside it cannot tell a good model from a timid one.
 *
 * On lookahead: fitLeague weights matches by exp(-decay * (now - date)). Using
 * the real clock for a 2025 fixture makes every weight small, but the fit is
 * invariant to a global scale on the weights — the L2 penalty is scaled by the
 * weight total for exactly that reason — so the ratios, and therefore the
 * ratings, are unchanged. The lookahead that would matter is training data,
 * and the slice below is strictly `date < kickoff`.
 *
 * Usage:
 *   npx tsx scripts/backtest.ts                    # full evaluation season
 *   npx tsx scripts/backtest.ts --recent=10        # last N fixtures per league
 *   npx tsx scripts/backtest.ts --leagues=E0,SP1
 */

import { buildPrediction } from "../src/lib/model/predict";
import { evaluatePick } from "../src/lib/settlement";
import { returnAtClose, summarise, type BacktestEntry } from "../src/lib/model/backtest";

import {
  csv, DIVISIONS, parse, priceFor, toMatch, toResultRow, type Row,
} from "./lib/football-data-uk";

/** Seasons to load by default, oldest first; see lib/football-data-uk.ts. */
const DEFAULT_SEASONS = ["2425", "2526"];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "     —" : `${(v * 100).toFixed(digits)}%`.padStart(6);

async function main() {
  const divs = (arg("leagues") ?? Object.keys(DIVISIONS).join(",")).split(",");
  const recent = arg("recent") ? Number(arg("recent")) : undefined;
  const trainCap = arg("trainCap") ? Number(arg("trainCap")) : undefined;
  const seasons = (arg("seasons") ?? DEFAULT_SEASONS.join(",")).split(",");
  const evaluationSeason = arg("evalFrom") ?? seasons[seasons.length - 1];

  const entries: BacktestEntry[] = [];
  /*
   * Parallel to `entries`: the model's own confidence for each published pick.
   * Kept out of BacktestEntry because it answers a question about this
   * experiment -- is confidence a usable pre-kickoff filter? -- rather than
   * being part of scoring a backtest.
   */
  const confidences: number[] = [];
  let skippedUnpublishable = 0;
  let skippedUngradable = 0;

  for (const div of divs) {
    const league = DIVISIONS[div];
    if (!league) throw new Error(`unknown division ${div}`);

    const history: Row[] = [];
    for (const season of seasons) history.push(...parse(await csv(season, div), div));
    history.sort((a, b) => a.date - b.date);

    const seasonStart = parse(await csv(evaluationSeason, div), div)[0]?.date ?? 0;
    let target = history.filter((r) => r.date >= seasonStart);
    if (recent) target = target.slice(-recent);

    process.stderr.write(
      `${div}: ${history.length} matches loaded, evaluating ${target.length}\n`,
    );

    for (const row of target) {
      // The only guard against lookahead that matters, and it is one line.
      // --trainCap simulates a thin provider: production currently sees only
      // 15-35 completed matches per competition, against the 700+ this
      // evaluation normally fits on.
      const all = history.filter((r) => r.date < row.date);
      const prior = trainCap ? all.slice(-trainCap) : all;
      const prediction = buildPrediction(toMatch(row, league), prior.map(toResultRow), []);

      // The same gate the site applies: no publishable pick, nothing shown,
      // so nothing to score. Counting these separately keeps the hit rate
      // honest about what fraction of fixtures the model declines.
      if (!prediction.sufficiency.publishable || !prediction.topPick) {
        skippedUnpublishable++;
        continue;
      }

      const pick = prediction.topPick;
      const outcome = evaluatePick(pick.market, row.homeGoals, row.awayGoals);
      if (!outcome) {
        skippedUngradable++;
        continue;
      }

      entries.push({
        market: pick.market,
        league: league.code,
        probability: pick.probability,
        outcome,
        ...priceFor(pick.market, row),
      });
      confidences.push(pick.confidence);
    }
  }

  const s = summarise(entries);

  console.log(`\n${"=".repeat(78)}`);
  console.log(`BACKTEST — ${entries.length} graded picks across ${divs.length} competitions`);
  console.log(`declined (insufficient history): ${skippedUnpublishable}   ungradable market: ${skippedUngradable}`);
  console.log("=".repeat(78));

  const line = (label: string, r: { n: number; wins: number; losses: number; pushes: number; hitRate: number | null; claimed: number; gap: number | null }) =>
    `  ${label.padEnd(22)} n=${String(r.n).padStart(4)}  ${String(r.wins).padStart(3)}-${String(r.losses).padEnd(3)}${r.pushes ? ` (${r.pushes}p)` : "     "}  hit=${pct(r.hitRate)}  claimed=${pct(r.claimed)}  gap=${r.gap === null ? "    —" : `${r.gap >= 0 ? "+" : ""}${r.gap.toFixed(1)}pp`}`;

  console.log(`\nOVERALL`);
  console.log(line("all picks", s.overall));
  console.log(`  Brier ${s.brier?.toFixed(4) ?? "—"}   calibration error ${pct(s.expectedCalibrationError)}`);

  console.log(`\nBY MARKET FAMILY`);
  for (const [k, r] of s.byMarketFamily) console.log(line(k, r));

  console.log(`\nBY MARKET`);
  for (const [k, r] of s.byMarket) if (r.n >= 5) console.log(line(k, r));

  console.log(`\nBY COMPETITION`);
  for (const [k, r] of s.byLeague) console.log(line(k, r));

  console.log(`\nCALIBRATION`);
  for (const b of s.calibration) {
    const gap = (b.realised ?? 0) - b.claimed;
    console.log(
      `  ${(b.from * 100).toFixed(0).padStart(3)}-${(b.to * 100).toFixed(0)}%  n=${String(b.n).padStart(4)}  claimed=${pct(b.claimed)}  realised=${pct(b.realised)}  gap=${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(1)}pp`,
    );
  }

  const roi = (list: BacktestEntry[]) => {
    const r = returnAtClose(list);
    if (r.roi === null) return "     —";
    return `${r.roi >= 0 ? "+" : ""}${(r.roi * 100).toFixed(2)}%`.padStart(8);
  };
  const avgPrice = (list: BacktestEntry[]) => {
    const priced = list.filter((e) => e.price !== undefined && e.price > 1);
    if (priced.length === 0) return "   —";
    return (priced.reduce((a, e) => a + (e.price ?? 0), 0) / priced.length).toFixed(3);
  };

  console.log(`\nRETURN BY MARKET — where the money is made or lost`);
  console.log(`  market                  n   priced   meanPrice     hit       ROI`);
  const byMarketEntries = new Map<string, BacktestEntry[]>();
  for (const e of entries) {
    const list = byMarketEntries.get(e.market) ?? [];
    list.push(e);
    byMarketEntries.set(e.market, list);
  }
  for (const [market, list] of [...byMarketEntries].sort((a, b) => b[1].length - a[1].length)) {
    if (list.length < 10) continue;
    const priced = list.filter((e) => e.price !== undefined && e.price > 1).length;
    const wins = list.filter((e) => e.outcome === "win").length;
    const graded = list.filter((e) => e.outcome !== "push").length;
    console.log(
      `  ${market.padEnd(18)} ${String(list.length).padStart(4)}   ${String(priced).padStart(5)}      ${avgPrice(list)}   ${pct(graded ? wins / graded : null)}  ${roi(list)}`,
    );
  }

  console.log(`\nRETURN BY MODEL CONFIDENCE — the only filter available pre-kickoff`);
  console.log(`  confidence              n   meanPrice     hit       ROI`);
  const confBands: [string, (c: number) => boolean][] = [
    ["under 40", (c) => c < 40],
    ["40 - 50", (c) => c >= 40 && c < 50],
    ["50 - 60", (c) => c >= 50 && c < 60],
    ["60 and over", (c) => c >= 60],
  ];
  for (const [label, test] of confBands) {
    const list = entries.filter((_, i) => test(confidences[i]));
    if (list.length === 0) continue;
    const wins = list.filter((e) => e.outcome === "win").length;
    const graded = list.filter((e) => e.outcome !== "push").length;
    console.log(
      `  ${label.padEnd(20)} ${String(list.length).padStart(4)}      ${avgPrice(list)}   ${pct(graded ? wins / graded : null)}  ${roi(list)}`,
    );
  }

  console.log(`\nRETURN BY PRICE BAND`);
  console.log(`  band                    n   meanPrice     hit       ROI`);
  const bands: [string, (p: number) => boolean][] = [
    ["under 1.30 (odds-on)", (p) => p < 1.3],
    ["1.30 - 1.60", (p) => p >= 1.3 && p < 1.6],
    ["1.60 - 2.00", (p) => p >= 1.6 && p < 2],
    ["2.00 - 3.00", (p) => p >= 2 && p < 3],
    ["3.00 and longer", (p) => p >= 3],
  ];
  for (const [label, test] of bands) {
    const list = entries.filter((e) => e.price !== undefined && e.price > 1 && test(e.price));
    if (list.length === 0) continue;
    const wins = list.filter((e) => e.outcome === "win").length;
    const graded = list.filter((e) => e.outcome !== "push").length;
    console.log(
      `  ${label.padEnd(20)} ${String(list.length).padStart(4)}      ${avgPrice(list)}   ${pct(graded ? wins / graded : null)}  ${roi(list)}`,
    );
  }

  const r = s.returnAtClose;
  console.log(`\nRETURN AT CLOSING PRICES (1 unit flat)`);
  console.log(
    `  priced ${r.priced} of ${entries.length} picks (${((100 * r.priced) / (entries.length || 1)).toFixed(0)}% coverage)`,
  );
  console.log(`  staked ${r.staked}   profit ${r.profit >= 0 ? "+" : ""}${r.profit.toFixed(2)}   ROI ${r.roi === null ? "—" : `${(r.roi * 100).toFixed(2)}%`}`);

  const b = s.marketBenchmark;
  console.log(`\nAGAINST THE CLOSING LINE (${b.n} selections with a de-vigged market probability)`);
  console.log(`  model said ${pct(b.modelClaimed)}   market said ${pct(b.marketClaimed)}`);
  console.log(`  model Brier ${b.modelBrier?.toFixed(4) ?? "—"}   market Brier ${b.marketBrier?.toFixed(4) ?? "—"}`);
  if (b.modelBrier !== null && b.marketBrier !== null) {
    const better = b.modelBrier < b.marketBrier;
    console.log(`  the ${better ? "MODEL" : "MARKET"} is better calibrated on these selections by ${Math.abs(b.modelBrier - b.marketBrier).toFixed(4)}`);
  }

  console.log(`\nAGAINST AN 85% ACCURACY TARGET`);
  const hit = s.overall.hitRate ?? 0;
  const graded = s.overall.wins + s.overall.losses;
  // Wald interval. Wide on purpose: it is the point.
  const se = graded > 0 ? Math.sqrt((hit * (1 - hit)) / graded) : 0;
  console.log(`  measured ${pct(hit)} over ${graded} graded picks (95% CI ${pct(hit - 1.96 * se)} to ${pct(hit + 1.96 * se)})`);
  console.log(`  shortfall to 85%: ${((0.85 - hit) * 100).toFixed(1)}pp`);
  const atOrAbove = entries.filter((e) => e.probability >= 0.85).length;
  console.log(`  selections where the model itself claimed >= 85%: ${atOrAbove} of ${entries.length}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
