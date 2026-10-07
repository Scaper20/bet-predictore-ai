/**
 * football-data.co.uk loading for the offline model tools (backtest.ts,
 * model-lab.ts): seasons of results with closing prices, cached on disk.
 */

import fs from "node:fs";
import path from "node:path";
import { deVig } from "../../src/lib/model/backtest";
import type { Match, ResultRow } from "../../src/lib/types";

/** football-data.co.uk division code -> our catalogue slug. */
export const DIVISIONS: Record<string, { code: string; label: string }> = {
  E0: { code: "premier-league", label: "English Premier League" },
  SP1: { code: "la-liga", label: "Spanish La Liga" },
  I1: { code: "serie-a", label: "Italian Serie A" },
  D1: { code: "bundesliga", label: "German Bundesliga" },
  F1: { code: "ligue-1", label: "French Ligue 1" },
  E1: { code: "championship", label: "English Championship" },
  N1: { code: "eredivisie", label: "Dutch Eredivisie" },
  P1: { code: "primeira-liga", label: "Portuguese Primeira Liga" },
};

/**
 * Seasons to load, oldest first. Everything from --evalFrom onward is scored;
 * the seasons before it are warm-up history only. Overridable so the same
 * harness can measure the window a parameter was FITTED on and the window it
 * was held out from, which is the only way to tell a real effect from one
 * season of luck.
 */

export const CACHE = path.join(process.cwd(), ".backtest-cache");

/** Margin assumed when deriving a double-chance price off the 1X2 book. */
export const DC_MARGIN = 0.05;

export interface Row {
  div: string;
  date: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** Closing 1X2 prices, market average. */
  close?: { home: number; draw: number; away: number };
  /** Shots on target, home and away. */
  hst?: number;
  ast?: number;
  /** Closing over/under 2.5 prices, market average. */
  closeOu?: { over: number; under: number };
  /** Half-time score, where the file records it. */
  htHome?: number;
  htAway?: number;
  /** Full-match counts, home then away, where the file records them. */
  stats?: MatchStats;
  /** Referee, where the file names one (the English divisions). */
  referee?: string;
}

/** Full-match counts from the file: shots, shots on target, corners, fouls, cards. */
export interface MatchStats {
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls?: [number, number];
  yellows: [number, number];
  reds: [number, number];
}

export async function csv(season: string, div: string): Promise<string> {
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

export function parse(body: string, div: string): Row[] {
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
  const iHst = at("HST");
  const iAst = at("AST");
  const iHth = at("HTHG");
  const iRef = at("Referee");
  const statCol = (name: string) => at(name);
  const iHs = statCol("HS"), iAs = statCol("AS"), iHc = statCol("HC"), iAc = statCol("AC");
  const iHf = statCol("HF"), iAf = statCol("AF"), iHy = statCol("HY"), iAy = statCol("AY");
  const iHr = statCol("HR"), iAr = statCol("AR");
  const iHta = at("HTAG");

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

    const hst = num(iHst);
    const ast = num(iAst);
    const hth = num(iHth);
    const hta = num(iHta);
    const pair = (i: number, j: number): [number, number] | undefined => {
      if (i < 0 || j < 0 || f[i]?.trim() === "" || f[j]?.trim() === "") return undefined;
      const x = Number(f[i]), y = Number(f[j]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
    };
    const shots = pair(iHs, iAs), sot = pair(iHst, iAst), corners = pair(iHc, iAc);
    const yellows = pair(iHy, iAy), reds = pair(iHr, iAr);
    const stats: MatchStats | undefined =
      shots && sot && corners && yellows && reds
        ? { shots, shotsOnTarget: sot, corners, fouls: pair(iHf, iAf), yellows, reds }
        : undefined;
    const referee = iRef >= 0 ? f[iRef]?.trim() || undefined : undefined;
    rows.push({
      stats,
      referee,
      htHome: Number.isFinite(hth) && f[iHth]?.trim() !== "" ? hth : undefined,
      htAway: Number.isFinite(hta) && f[iHta]?.trim() !== "" ? hta : undefined,
      div,
      hst: Number.isFinite(hst) ? hst : undefined,
      ast: Number.isFinite(ast) ? ast : undefined,
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

export function toResultRow(r: Row): ResultRow {
  return {
    date: r.date,
    homeId: r.home,
    homeName: r.home,
    awayId: r.away,
    awayName: r.away,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    leagueId: r.div,
    homeShotsOnTarget: r.hst,
    awayShotsOnTarget: r.ast,
  };
}

export function toMatch(r: Row, league: { code: string; label: string }): Match {
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
export function priceFor(
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
    /*
     * Double chance carries no dedicated column in this source, so its price
     * is DERIVED: de-vig the 1X2 book, add the two legs, re-apply a margin.
     *
     * This matters enough to spell out, because double chance is the family
     * the ranker picks most and leaving it unpriced meant the reported return
     * covered only 43% of picks — and specifically excluded the shortest
     * prices, which is where a flat stake bleeds. DC_MARGIN is deliberately
     * kind to the model: real double-chance books usually run wider than 5%,
     * so a negative return measured here is a floor on how negative it is.
     */
    const [h, d, a] = deVig([row.close.home, row.close.draw, row.close.away]);
    const priced = (p: number) => ({ price: 1 / p / (1 + DC_MARGIN), marketProbability: p });
    if (market === "dc:home-draw") return priced(h + d);
    if (market === "dc:away-draw") return priced(a + d);
    if (market === "dc:home-away") return priced(h + a);
  }
  if (row.closeOu && market.startsWith("ou:") && !market.includes(":2.5")) {
    // Only the 2.5 line is quoted. Other lines stay unpriced rather than
    // being extrapolated off it — the shape of a totals book is not linear
    // in the line, and guessing it would put invented numbers in a return.
    return {};
  }
  if (row.closeOu && (market === "ou:over:2.5" || market === "ou:under:2.5")) {
    const [over, under] = deVig([row.closeOu.over, row.closeOu.under]);
    return market === "ou:over:2.5"
      ? { price: row.closeOu.over, marketProbability: over }
      : { price: row.closeOu.under, marketProbability: under };
  }
  return {};
}

