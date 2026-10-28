/**
 * Research and data: how well the model reads every market SportyBet lists
 * beyond the main ones (team goals, team corners, shots and shots on target,
 * totals, handicaps, "most"), market by market and club by club.
 *
 * Reads the walk-forward cache written by scripts/niche-lab.ts
 * --stage=predict (17 divisions, every prediction made before its game) and
 * scores the holdout (July 2025 on), on the lines SportyBet sets: for each
 * stat family the k lines nearest 50/50 per game (docs/sportybet-lines.md),
 * for team goals 0.5 to 2.5.
 *
 * Per market: stated against landed, Brier score, and skill against a naive
 * read (each club's own for-and-against averages for corners and shots; the
 * closing market for the result, double chance and 2.5 line), plus how the
 * lines the model rates 70-85% landed, which is what a published pick would
 * be. Per club: expected against actual goals, corners, shots and shots on
 * target for and against, and how its own team lines rated 70-85% landed.
 *
 *   npx tsx scripts/market-accuracy.ts             report
 *   npx tsx scripts/market-accuracy.ts --sql=FILE  also write the upserts for
 *                                                  market_accuracy and team_accuracy (0085)
 */

import fs from "node:fs";
import path from "node:path";
import { statGrid, STAT_LINES } from "../src/lib/model/match-stats";
import { scoreMatrix } from "../src/lib/model/poisson";
import { calibrationKey } from "../src/lib/model/headline-engine";
import type { Pred } from "./niche-lab";
import { LEAGUES } from "../src/lib/leagues";
import { CACHE } from "./lib/football-data-uk";
import { chance, closing, dists, GOALS, KINDS, ladder, won, type Kind } from "./lib/replay-lines";

const PREDS_FILE = path.join(CACHE, "niche-preds.json");
const FROM = Date.UTC(2025, 6, 1);
const SQL = process.argv.find((a) => a.startsWith("--sql="))?.split("=")[1];
const PICK_BAND: [number, number] = [0.7, 0.85];
const TEAM_GOALS = [0.5, 1.5, 2.5].flatMap((l) => ["home", "away"].flatMap((s) => [`tg:${s}:over:${l}`, `tg:${s}:under:${l}`]));

interface MarketTally {
  n: number;
  stated: number;
  landed: number;
  brier: number;
  /** Against the naive read, over the lines that have one. */
  nBase: number;
  brierModel: number;
  brierBase: number;
  picks: number;
  picksLanded: number;
  picksStated: number;
}
const mt = (): MarketTally => ({ n: 0, stated: 0, landed: 0, brier: 0, nBase: 0, brierModel: 0, brierBase: 0, picks: 0, picksLanded: 0, picksStated: 0 });

type TeamKind = "goals" | Kind;
interface TeamTally {
  games: number;
  expFor: number;
  actFor: number;
  absFor: number;
  expAgainst: number;
  actAgainst: number;
  absAgainst: number;
  picks: number;
  picksLanded: number;
  picksStated: number;
}
const tt = (): TeamTally => ({ games: 0, expFor: 0, actFor: 0, absFor: 0, expAgainst: 0, actAgainst: 0, absAgainst: 0, picks: 0, picksLanded: 0, picksStated: 0 });

/** The market a row is filed under: the line dropped for stats (calibrationKey), sides kept. */
const keyOf = (m: string) => (m.startsWith("tg:") ? m.replace(/:[\d.]+$/, "") : calibrationKey(m));

function main() {
  const preds: Pred[] = JSON.parse(fs.readFileSync(PREDS_FILE, "utf8"));
  const hold = preds.filter((r) => r.t >= FROM);
  // The catalogue's own code for each football-data.co.uk division (importing niche-lab would run it).
  const codeOf = new Map(LEAGUES.flatMap((l) => (l.archive?.footballDataUk ? [[l.archive.footballDataUk, l.code] as const] : [])));
  const markets = new Map<string, MarketTally>();
  const teams = new Map<string, TeamTally>();

  const score = (market: string, p: number, landed: boolean, base: number | null) => {
    const k = keyOf(market);
    const t = markets.get(k) ?? mt();
    const y = landed ? 1 : 0;
    t.n++;
    t.stated += p;
    t.landed += y;
    t.brier += (p - y) ** 2;
    if (base !== null) {
      t.nBase++;
      t.brierModel += (p - y) ** 2;
      t.brierBase += (base - y) ** 2;
    }
    if (p >= PICK_BAND[0] && p <= PICK_BAND[1]) {
      t.picks++;
      t.picksStated += p;
      t.picksLanded += y;
    }
    markets.set(k, t);
  };
  const team = (code: string, name: string, kind: TeamKind) => {
    const key = `${code}|${name}|${kind}`;
    const t = teams.get(key) ?? tt();
    teams.set(key, t);
    return t;
  };
  const teamPick = (t: TeamTally, p: number, landed: boolean) => {
    if (p < PICK_BAND[0] || p > PICK_BAND[1]) return;
    t.picks++;
    t.picksStated += p;
    if (landed) t.picksLanded++;
  };
  const sideOf = (m: string) => (/^(tg|corners|shots|sot):(home|away):/.test(m) ? m.split(":")[1] : /:most:(home|away)$/.test(m) ? m.split(":").pop()! : null);

  for (const r of hold) {
    const code = codeOf.get(r.d);
    if (!code) continue;
    const g = dists(scoreMatrix(r.dc[0], r.dc[1], r.dc[2]));
    const home = team(code, r.h, "goals"), away = team(code, r.a, "goals");
    for (const [t, e, a, eo, ao] of [[home, r.dc[0], r.hg, r.dc[1], r.ag], [away, r.dc[1], r.ag, r.dc[0], r.hg]] as const) {
      t.games++; t.expFor += e; t.actFor += a; t.absFor += Math.abs(e - a); t.expAgainst += eo; t.actAgainst += ao; t.absAgainst += Math.abs(eo - ao);
    }
    for (const m of [...GOALS, ...TEAM_GOALS]) {
      const p = chance(m, g);
      const w = won(m, r.hg, r.ag);
      score(m, p, w, closing(m, r.mk));
      const s = sideOf(m);
      if (s) teamPick(s === "home" ? home : away, p, w);
    }
    for (const k of KINDS) {
      const v = r.st[k];
      if (!v || v[6] < 0) continue;
      const d = dists(statGrid({ home: v[0], away: v[1] }, { kTotal: v[2], rho: v[3] }, STAT_LINES[k].max));
      const naive = dists(statGrid({ home: v[4], away: v[5] }, { kTotal: v[2], rho: v[3] }, STAT_LINES[k].max));
      const th = team(code, r.h, k), ta = team(code, r.a, k);
      for (const [t, e, a, eo, ao] of [[th, v[0], v[6], v[1], v[7]], [ta, v[1], v[7], v[0], v[6]]] as const) {
        t.games++; t.expFor += e; t.actFor += a; t.absFor += Math.abs(e - a); t.expAgainst += eo; t.actAgainst += ao; t.absAgainst += Math.abs(eo - ao);
      }
      for (const m of ladder(k, d)) {
        const p = chance(m, d);
        const w = won(m, v[6], v[7]);
        score(m, p, w, chance(m, naive));
        const s = sideOf(m);
        if (s) teamPick(s === "home" ? th : ta, p, w);
      }
    }
  }

  // ---- report
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const rows = [...markets].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${hold.length} games from July 2025, ${new Set(hold.map((r) => r.d)).size} divisions\n`);
  console.log("market                    lines   stated  landed   brier   skill  | rated 70-85%: picks  landed  stated");
  for (const [k, t] of rows) {
    const skill = t.nBase ? 1 - t.brierModel / t.brierBase : null;
    console.log(
      `${k.padEnd(24)} ${String(t.n).padStart(6)}  ${pct(t.stated / t.n).padStart(6)}  ${pct(t.landed / t.n).padStart(6)}  ${(t.brier / t.n).toFixed(4)}  ${skill === null ? "    — " : `${skill >= 0 ? "+" : ""}${(100 * skill).toFixed(1)}%`.padStart(6)}  |  ${String(t.picks).padStart(6)}  ${t.picks ? pct(t.picksLanded / t.picks).padStart(6) : "     —"}  ${t.picks ? pct(t.picksStated / t.picks).padStart(6) : ""}`,
    );
  }
  const clubs = new Set([...teams.keys()].map((k) => k.split("|").slice(0, 2).join("|"))).size;
  console.log(`\n${clubs} clubs, ${teams.size} club-and-stat rows`);

  if (SQL) {
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const n = (x: number, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "null");
    const lines: string[] = [];
    const mvals = rows.map(([k, t]) => {
      const skill = t.nBase ? 1 - t.brierModel / t.brierBase : NaN;
      return `(${q(k)}, ${t.n}, ${n(t.stated / t.n)}, ${n(t.landed / t.n)}, ${n(t.brier / t.n)}, ${n(skill)}, ${t.picks}, ${t.picks ? n(t.picksLanded / t.picks) : "null"}, ${t.picks ? n(t.picksStated / t.picks) : "null"})`;
    });
    lines.push(
      `insert into public.market_accuracy (market_key, lines, stated, landed, brier, skill, picks, picks_landed, picks_stated) values\n${mvals.join(",\n")}\non conflict (market_key) do update set lines = excluded.lines, stated = excluded.stated, landed = excluded.landed, brier = excluded.brier, skill = excluded.skill, picks = excluded.picks, picks_landed = excluded.picks_landed, picks_stated = excluded.picks_stated, updated_at = now();`,
    );
    const tvals = [...teams].filter(([, t]) => t.games > 0).map(([k, t]) => {
      const [code, name, kind] = k.split("|");
      return `(${q(code)}, ${q(name)}, ${q(kind)}, ${t.games}, ${n(t.expFor / t.games, 3)}, ${n(t.actFor / t.games, 3)}, ${n(t.absFor / t.games, 3)}, ${n(t.expAgainst / t.games, 3)}, ${n(t.actAgainst / t.games, 3)}, ${n(t.absAgainst / t.games, 3)}, ${t.picks}, ${t.picks ? n(t.picksLanded / t.picks) : "null"}, ${t.picks ? n(t.picksStated / t.picks) : "null"})`;
    });
    for (let i = 0; i < tvals.length; i += 400) {
      lines.push(
        `insert into public.team_accuracy (league_code, team, kind, games, expected_for, actual_for, mae_for, expected_against, actual_against, mae_against, picks, picks_landed, picks_stated) values\n${tvals.slice(i, i + 400).join(",\n")}\non conflict (league_code, team, kind) do update set games = excluded.games, expected_for = excluded.expected_for, actual_for = excluded.actual_for, mae_for = excluded.mae_for, expected_against = excluded.expected_against, actual_against = excluded.actual_against, mae_against = excluded.mae_against, picks = excluded.picks, picks_landed = excluded.picks_landed, picks_stated = excluded.picks_stated, updated_at = now();`,
      );
    }
    fs.writeFileSync(SQL, lines.join("\n\n"));
    console.log(`wrote ${SQL}: ${mvals.length} markets, ${tvals.length} club rows`);
  }
}

main();
