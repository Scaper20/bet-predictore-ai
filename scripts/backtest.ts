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

import fs from "node:fs";
import path from "node:path";
import { buildPrediction } from "../src/lib/model/predict";
import { evaluatePick } from "../src/lib/settlement";
import { deVig, summarise, type BacktestEntry } from "../src/lib/model/backtest";
import type { Match, ResultRow } from "../src/lib/types";

/** football-data.co.uk division code -> our catalogue slug. */
const DIVISIONS: Record<string, { code: string; label: string }> = {
  E0: { code: "premier-league", label: "English Premier League" },
  SP1: { code: "la-liga", label: "Spanish La Liga" },
  I1: { code: "serie-a", label: "Italian Serie A" },
  D1: { code: "bundesliga", label: "German Bundesliga" },
  F1: { code: "ligue-1", label: "French Ligue 1" },
};

/** Seasons to load, oldest first. The last one is what gets evaluated. */
const SEASONS = ["2425", "2526"];

const CACHE = path.join(process.cwd(), ".backtest-cache");

interface Row {
  div: string;
  date: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** Closing 1X2 prices, market average. */
  close?: { home: number; draw: number; away: number };
  /** Closing over/under 2.5 prices, market average. */
  closeOu?: { over: number; under: number };
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function csv(season: string, div: string): Promise<string> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${season}-${div}.csv`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const url = `https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  const body = await response.text();
  fs.writeFileSync(file, body);
  return body;
}

/** Splits a CSV line, honouring the quoted fields the referee column uses. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parse(body: string, div: string): Row[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsv(lines[0]).map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);

  const iDate = at("Date");
  const iTime = at("Time");
  const iHome = at("HomeTeam");
  const iAway = at("AwayTeam");
  const iHg = at("FTHG");
  const iAg = at("FTAG");
  // Closing market averages. AvgC* is the market consensus at kickoff, which
  // is the fairest thing to score against: it is the price a normal person
  // could actually have taken, not a best-of-forty shop-around.
  const iCh = at("AvgCH");
  const iCd = at("AvgCD");
  const iCa = at("AvgCA");
  const iCo = at("AvgC>2.5");
  const iCu = at("AvgC<2.5");

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    const home = f[iHome]?.trim();
    const away = f[iAway]?.trim();
    const hg = Number(f[iHg]);
    const ag = Number(f[iAg]);
    if (!home || !away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;

    // dd/mm/yyyy, occasionally dd/mm/yy in older files.
    const [d, m, y] = (f[iDate] ?? "").split("/");
    if (!d || !m || !y) continue;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const [hh, mm] = (f[iTime] ?? "15:00").split(":");
    const date = Date.UTC(year, Number(m) - 1, Number(d), Number(hh) || 15, Number(mm) || 0);

    const num = (i: number) => (i >= 0 ? Number(f[i]) : NaN);
    const ch = num(iCh);
    const cd = num(iCd);
    const ca = num(iCa);
    const co = num(iCo);
    const cu = num(iCu);

    rows.push({
      div,
      date,
      home,
      away,
      homeGoals: hg,
      awayGoals: ag,
      close:
        Number.isFinite(ch) && Number.isFinite(cd) && Number.isFinite(ca)
          ? { home: ch, draw: cd, away: ca }
          : undefined,
      closeOu:
        Number.isFinite(co) && Number.isFinite(cu) ? { over: co, under: cu } : undefined,
    });
  }
  return rows.sort((a, b) => a.date - b.date);
}

function toResultRow(r: Row): ResultRow {
  return {
    date: r.date,
    homeId: r.home,
    homeName: r.home,
    awayId: r.away,
    awayName: r.away,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    leagueId: r.div,
  };
}

function toMatch(r: Row, league: { code: string; label: string }): Match {
  return {
    id: `bt:${r.div}:${r.date}:${r.home}`,
    kickoff: new Date(r.date).toISOString(),
    status: "scheduled",
    league: { id: r.div, name: league.label, code: league.code },
    home: { id: r.home, name: r.home, shortName: r.home },
    away: { id: r.away, name: r.away, shortName: r.away },
    score: { home: null, away: null },
    source: "thesportsdb",
  };
}

/**
 * The closing price and de-vigged market probability for a selection, where
 * the dataset carries one. Double chance, BTTS and correct score are not
 * priced in this source; those entries carry a hit rate and nothing else,
 * which the report states rather than papering over.
 */
function priceFor(
  market: string,
  row: Row,
): { price?: number; marketProbability?: number } {
  if (row.close && market.startsWith("1x2:")) {
    const [h, d, a] = deVig([row.close.home, row.close.draw, row.close.away]);
    if (market === "1x2:home") return { price: row.close.home, marketProbability: h };
    if (market === "1x2:draw") return { price: row.close.draw, marketProbability: d };
    if (market === "1x2:away") return { price: row.close.away, marketProbability: a };
  }
  if (row.close && market.startsWith("dc:")) {
    // No dedicated double-chance price in this source, but the de-vigged 1X2
    // probabilities give the benchmark even without a tradeable price.
    const [h, d, a] = deVig([row.close.home, row.close.draw, row.close.away]);
    if (market === "dc:home-draw") return { marketProbability: h + d };
    if (market === "dc:away-draw") return { marketProbability: a + d };
    if (market === "dc:home-away") return { marketProbability: h + a };
  }
  if (row.closeOu && (market === "ou:over:2.5" || market === "ou:under:2.5")) {
    const [over, under] = deVig([row.closeOu.over, row.closeOu.under]);
    return market === "ou:over:2.5"
      ? { price: row.closeOu.over, marketProbability: over }
      : { price: row.closeOu.under, marketProbability: under };
  }
  return {};
}

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "     —" : `${(v * 100).toFixed(digits)}%`.padStart(6);

async function main() {
  const divs = (arg("leagues") ?? Object.keys(DIVISIONS).join(",")).split(",");
  const recent = arg("recent") ? Number(arg("recent")) : undefined;
  const evaluationSeason = SEASONS[SEASONS.length - 1];

  const entries: BacktestEntry[] = [];
  let skippedUnpublishable = 0;
  let skippedUngradable = 0;

  for (const div of divs) {
    const league = DIVISIONS[div];
    if (!league) throw new Error(`unknown division ${div}`);

    const history: Row[] = [];
    for (const season of SEASONS) history.push(...parse(await csv(season, div), div));
    history.sort((a, b) => a.date - b.date);

    const seasonStart = parse(await csv(evaluationSeason, div), div)[0]?.date ?? 0;
    let target = history.filter((r) => r.date >= seasonStart);
    if (recent) target = target.slice(-recent);

    process.stderr.write(
      `${div}: ${history.length} matches loaded, evaluating ${target.length}\n`,
    );

    for (const row of target) {
      // The only guard against lookahead that matters, and it is one line.
      const prior = history.filter((r) => r.date < row.date);
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
