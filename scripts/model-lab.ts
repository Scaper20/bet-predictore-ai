/**
 * Model lab: score a model configuration walk-forward, fast enough to compare
 * many of them.
 *
 * Same rules as backtest.ts (fit only on matches before kickoff, grade the
 * same headline pick the site would publish), with two differences:
 *  - one fit per competition per matchday, reused for that day's fixtures
 *    (they share the same training slice anyway), so a run takes seconds;
 *  - it scores the whole distribution, not just the headline pick: 1X2 and
 *    over/under 2.5 log loss on EVERY fixture, beside the closing market's.
 *    A pick hit rate can be bought with shorter prices; log loss cannot.
 *
 * Usage:
 *   npx tsx scripts/model-lab.ts --from=2425 --to=2425 --hl=180 --reg=0.02 --ts=0.8
 *   npx tsx scripts/model-lab.ts --grid            # parameter sweep on --from/--to
 */

import { buildPrediction, type ModelOptions } from "../src/lib/model/predict";
import { fitLeague } from "../src/lib/model/fit";
import { evaluatePick } from "../src/lib/settlement";
import { deVig, returnAtClose } from "../src/lib/model/backtest";
import { csv, DIVISIONS, parse, priceFor, toMatch, toResultRow, type Row } from "./lib/football-data-uk";

const SEASONS = ["2223", "2324", "2425", "2526", "2627"];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

export interface LabResult {
  fixtures: number;
  ll1x2: number;
  mktLl1x2: number;
  llOu: number;
  mktLlOu: number;
  picks: number;
  hit: number;
  roi: number | null;
  priced: number;
}

let loaded: Map<string, Row[]> | null = null;
async function data(): Promise<Map<string, Row[]>> {
  if (loaded) return loaded;
  loaded = new Map();
  for (const div of Object.keys(DIVISIONS)) {
    const rows: Row[] = [];
    for (const s of SEASONS) {
      try {
        rows.push(...parse(await csv(s, div), div));
      } catch {
        // A season not published yet: nothing to load.
      }
    }
    loaded.set(div, rows.sort((a, b) => a.date - b.date));
  }
  return loaded;
}

async function seasonStart(season: string, div: string): Promise<number> {
  return parse(await csv(season, div), div)[0]?.date ?? Number.POSITIVE_INFINITY;
}

export async function evaluate(opts: ModelOptions, from: string, to: string, divs = Object.keys(DIVISIONS)): Promise<LabResult> {
  const all = await data();
  let fixtures = 0, ll1 = 0, mll1 = 0, llOu = 0, mllOu = 0, ouN = 0;
  let picks = 0, wins = 0;
  const priced: { price?: number; outcome: "win" | "lose" | "push"; market: string; league: string; probability: number }[] = [];

  for (const div of divs) {
    const rows = all.get(div) ?? [];
    const lo = await seasonStart(from, div);
    const nextIdx = SEASONS.indexOf(to) + 1;
    const hi = nextIdx < SEASONS.length ? await seasonStart(SEASONS[nextIdx], div).catch(() => Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    const target = rows.filter((r) => r.date >= lo && r.date < hi);

    let dayKey = "";
    let prior: ReturnType<typeof toResultRow>[] = [];
    let prefit: ReturnType<typeof fitLeague> | undefined;
    for (const row of target) {
      const day = new Date(row.date).toISOString().slice(0, 10);
      if (day !== dayKey) {
        dayKey = day;
        const dayStart = Date.parse(day);
        prior = rows.filter((r) => r.date < dayStart).map(toResultRow);
        prefit = fitLeague(prior, opts.fit);
      }
      const p = buildPrediction(toMatch(row, DIVISIONS[div]), prior, [], { ...opts, prefit });
      const m = p.markets;
      const res = row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
      const probs = [m.home, m.draw, m.away];
      if (row.close) {
        const mk = deVig([row.close.home, row.close.draw, row.close.away]);
        fixtures++;
        ll1 += -Math.log(Math.max(1e-9, probs[res]));
        mll1 += -Math.log(Math.max(1e-9, mk[res]));
      }
      if (row.closeOu) {
        const over = row.homeGoals + row.awayGoals > 2.5;
        const [mo] = deVig([row.closeOu.over, row.closeOu.under]);
        const po = m.over["2.5"];
        ouN++;
        llOu += -Math.log(Math.max(1e-9, over ? po : 1 - po));
        mllOu += -Math.log(Math.max(1e-9, over ? mo : 1 - mo));
      }
      if (p.sufficiency.publishable && p.topPick) {
        const outcome = evaluatePick(p.topPick.market, row.homeGoals, row.awayGoals);
        if (!outcome) continue;
        picks++;
        if (outcome === "win") wins++;
        priced.push({ outcome, market: p.topPick.market, league: div, probability: p.topPick.probability, ...priceFor(p.topPick.market, row) });
      }
    }
  }
  const r = returnAtClose(priced);
  return {
    fixtures,
    ll1x2: ll1 / fixtures,
    mktLl1x2: mll1 / fixtures,
    llOu: llOu / ouN,
    mktLlOu: mllOu / ouN,
    picks,
    hit: wins / picks,
    roi: r.roi,
    priced: r.priced,
  };
}

export function fmt(label: string, r: LabResult): string {
  return `${label.padEnd(34)} 1x2 LL ${r.ll1x2.toFixed(4)} (mkt ${r.mktLl1x2.toFixed(4)})  OU LL ${r.llOu.toFixed(4)} (mkt ${r.mktLlOu.toFixed(4)})  picks ${r.picks} hit ${(r.hit * 100).toFixed(1)}%  ROI ${r.roi === null ? "—" : (r.roi * 100).toFixed(2) + "%"}`;
}

async function main() {
  const from = arg("from") ?? "2425";
  const to = arg("to") ?? from;
  const divs = arg("leagues")?.split(",");
  if (process.argv.includes("--grid")) {
    for (const hl of [90, 120, 180, 270, 365]) {
      for (const reg of [0.005, 0.01, 0.02, 0.04]) {
        const r = await evaluate({ fit: { halfLifeDays: hl, regularisation: reg } }, from, to, divs);
        console.log(fmt(`hl=${hl} reg=${reg}`, r));
      }
    }
    return;
  }
  const opts: ModelOptions = {
    fit: {
      halfLifeDays: arg("hl") ? Number(arg("hl")) : undefined,
      regularisation: arg("reg") ? Number(arg("reg")) : undefined,
    },
    totalsShrink: arg("ts") ? Number(arg("ts")) : undefined,
  };
  for (const k of Object.keys(opts.fit!) as (keyof NonNullable<ModelOptions["fit"]>)[]) if (opts.fit![k] === undefined) delete opts.fit![k];
  console.log(fmt(`${from}-${to} ${JSON.stringify(opts)}`, await evaluate(opts, from, to, divs)));
}

if (process.argv[1]?.endsWith("model-lab.ts")) void main();
