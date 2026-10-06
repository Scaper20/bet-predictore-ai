/**
 * Replays the live track record with the current model, without lookahead.
 *
 * For every settled pick in predictions_log: train on the archived results of
 * that competition that kicked off BEFORE the game (club names linked exactly
 * as the site links them), take the headline pick the current model would
 * have published — or none, if it would have declined — and grade it against
 * the real final score.
 *
 * Every settled pick is replayed, wins and losses alike: replaying only the
 * losses would flatter any model. Nothing is written back. The live record is
 * what was actually published, and stays that way; this is a backtest, and is
 * reported as one.
 *
 *   npx tsx --env-file=.env.local scripts/replay-track-record.ts
 */

import { createClient } from "@supabase/supabase-js";
import { buildPrediction } from "../src/lib/model/predict";
import { evaluatePick } from "../src/lib/settlement";
import { leagueByCode } from "../src/lib/leagues";
import { canonicaliseRows, looseKey, nameScope, type NameBook } from "../src/lib/teams/canonical";
import type { Match, ResultRow } from "../src/lib/types";

/**
 * Rows logged before 0013 carry the feed's display name and no code. These
 * are the same competitions the catalogue archives, so they are replayed on
 * that archive; anything not listed here really is uncatalogued.
 */
const LEGACY_NAMES: Record<string, string> = {
  "Premier League": "premier-league",
  "English Premier League": "premier-league",
  Championship: "championship",
  "English Championship": "championship",
  Eredivisie: "eredivisie",
  "Primeira Liga": "primeira-liga",
  Bundesliga: "bundesliga",
  "Ligue 1": "ligue-1",
  "Serie A": "serie-a",
  "Primera Division": "la-liga",
  "Campeonato Brasileiro Série A": "brasileirao",
  "UEFA Champions League": "champions-league",
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false } });

/** Same cap as the site's archive read (src/lib/archive/history-store.ts). */
const MAX_ROWS = 1200;

interface Logged {
  match_id: string;
  league: string;
  league_code: string | null;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  result: "win" | "lose" | "push";
  actual_home_goals: number;
  actual_away_goals: number;
  home_name: string;
  away_name: string;
}

async function page<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await q(i * 1000, i * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const books = new Map<string, NameBook>();
async function nameBook(scope: string): Promise<NameBook> {
  const hit = books.get(scope);
  if (hit) return hit;
  const teams = await page<{ name: string }>((a, b) => db.from("teams").select("name").eq("scope", scope).order("id").range(a, b));
  const aliases = await page<{ alias: string; alias_key: string; team: { name: string } | null }>((a, b) =>
    db.from("team_aliases").select("alias, alias_key, team:teams(name)").eq("scope", scope).order("alias_key").range(a, b) as never,
  );
  const canonical = new Map<string, string>();
  const spellings = new Map<string, string[]>();
  const add = (k: string, spelling: string, name: string) => {
    if (!k) return;
    if (!canonical.has(k)) canonical.set(k, name);
    const list = spellings.get(name) ?? [name];
    if (!list.includes(spelling)) list.push(spelling);
    spellings.set(name, list);
  };
  for (const t of teams) add(looseKey(t.name), t.name, t.name);
  for (const a of aliases) if (a.team?.name) add(a.alias_key, a.alias, a.team.name);
  const book = { canonical, spellings };
  books.set(scope, book);
  return book;
}

const archives = new Map<string, ResultRow[]>();
async function archive(code: string): Promise<ResultRow[]> {
  const hit = archives.get(code);
  if (hit) return hit;
  const rows = await page<Record<string, unknown>>((a, b) =>
    db.from("historical_results")
      .select("kickoff, home_name, away_name, home_goals, away_goals, home_shots_on_target, away_shots_on_target")
      .eq("league_code", code)
      .order("kickoff", { ascending: false })
      .range(a, b),
  );
  const out = rows.map((r) => ({
    homeId: r.home_name as string, awayId: r.away_name as string,
    homeName: r.home_name as string, awayName: r.away_name as string,
    homeGoals: r.home_goals as number, awayGoals: r.away_goals as number,
    date: Date.parse(r.kickoff as string), leagueId: code,
    homeShotsOnTarget: (r.home_shots_on_target as number | null) ?? undefined,
    awayShotsOnTarget: (r.away_shots_on_target as number | null) ?? undefined,
  }));
  archives.set(code, out);
  return out;
}

async function main() {
  const picks = await page<Logged>((a, b) =>
    db.from("predictions_log")
      .select("match_id, league, league_code, kickoff, market, label, probability, result, actual_home_goals, actual_away_goals, home_name, away_name")
      .in("result", ["win", "lose"])
      .order("kickoff")
      .range(a, b),
  );

  let v1Wins = 0, v1Losses = 0;
  let v2Wins = 0, v2Losses = 0, v2Declined = 0, v2NoArchive = 0;
  // On the fixtures where BOTH published: the cleanest head-to-head.
  let bothV1 = 0, bothV2 = 0, both = 0;
  const flips = { lossToWin: 0, winToLoss: 0 };
  const byLeague = new Map<string, { v1w: number; v1l: number; v2w: number; v2l: number; dec: number }>();
  const lines: string[] = [];

  for (const p of picks) {
    const v1Won = p.result === "win";
    if (v1Won) v1Wins++; else v1Losses++;
    const lg = p.league_code ?? LEGACY_NAMES[p.league] ?? `(uncatalogued) ${p.league}`;
    const L = byLeague.get(lg) ?? { v1w: 0, v1l: 0, v2w: 0, v2l: 0, dec: 0 };
    if (v1Won) L.v1w++; else L.v1l++;
    byLeague.set(lg, L);

    const code = p.league_code ?? LEGACY_NAMES[p.league];
    const def = code ? leagueByCode(code) : undefined;
    if (!def || def.confederation) {
      // No archive to replay on (an uncatalogued competition, or a pooled
      // international one): goals-v2 publishes from 200 archived matches, so
      // it would have declined.
      v2Declined++; v2NoArchive++; L.dec++;
      lines.push(`DECLINED  ${p.kickoff.slice(0, 10)} ${p.home_name} v ${p.away_name} (${lg}) — no archive; v1 ${p.result}`);
      continue;
    }

    const kickoff = Date.parse(p.kickoff);
    const scope = nameScope(def);
    const prior = (await archive(def.code)).filter((r) => r.date < kickoff - 3 * 3_600_000).slice(0, MAX_ROWS);
    const book = scope ? await nameBook(scope) : undefined;
    const rows = book ? canonicaliseRows(prior, book) : prior;
    const canon = (n: string) => book?.canonical.get(looseKey(n)) ?? n;
    const match: Match = {
      id: p.match_id, kickoff: p.kickoff, status: "scheduled",
      league: { id: def.code, name: def.name, code: def.code },
      home: { id: p.home_name, name: p.home_name, shortName: p.home_name },
      away: { id: p.away_name, name: p.away_name, shortName: p.away_name },
      score: { home: null, away: null }, source: "thesportsdb",
    };
    // REPLAY_FIT=v1 replays goals-v1's fit settings on the same data and name
    // links, separating what the model changed from what the data fixes did.
    const fit = process.env.REPLAY_FIT === "v1" ? { regularisation: 0.02, newcomerPrior: 0, shotWeight: 0 } : undefined;
    const pred = buildPrediction(match, rows, [], { fit, ratingNames: { home: canon(p.home_name), away: canon(p.away_name) } });
    if (!pred.sufficiency.publishable || !pred.topPick) {
      v2Declined++; L.dec++;
      lines.push(`DECLINED  ${p.kickoff.slice(0, 10)} ${p.home_name} v ${p.away_name} (${lg}) — ${pred.sufficiency.reason}; v1 ${p.result}`);
      continue;
    }
    const outcome = evaluatePick(pred.topPick.market, p.actual_home_goals, p.actual_away_goals);
    if (outcome !== "win" && outcome !== "lose") continue;
    const v2Won = outcome === "win";
    if (v2Won) { v2Wins++; L.v2w++; } else { v2Losses++; L.v2l++; }
    both++; if (v1Won) bothV1++; if (v2Won) bothV2++;
    if (!v1Won && v2Won) flips.lossToWin++;
    if (v1Won && !v2Won) flips.winToLoss++;
    lines.push(
      `${v2Won ? "WIN " : "LOSS"}      ${p.kickoff.slice(0, 10)} ${p.home_name} ${p.actual_home_goals}-${p.actual_away_goals} ${p.away_name} (${lg})` +
        ` — v2: ${pred.topPick.label} ${(pred.topPick.probability * 100).toFixed(0)}% | v1 published: ${p.label} → ${p.result}`,
    );
  }

  const pct = (w: number, l: number) => (w + l ? `${((100 * w) / (w + l)).toFixed(1)}%` : "—");
  console.log("REPLAY OF THE LIVE TRACK RECORD (no lookahead; nothing written)\n");
  console.log(`settled live picks:          ${picks.length}`);
  console.log(`goals-v1 as published:       ${v1Wins}-${v1Losses}  (${pct(v1Wins, v1Losses)})`);
  console.log(`goals-v2 replayed:           ${v2Wins}-${v2Losses}  (${pct(v2Wins, v2Losses)}) on the ${v2Wins + v2Losses} it would have published`);
  console.log(`goals-v2 would have declined: ${v2Declined}  (${v2NoArchive} with no archive at all)`);
  console.log(`\nsame fixtures, both published (${both}):  v1 ${pct(bothV1, both - bothV1)}   v2 ${pct(bothV2, both - bothV2)}`);
  console.log(`  v1 losses v2 would have won: ${flips.lossToWin}   v1 wins v2 would have lost: ${flips.winToLoss}`);
  console.log("\nBY COMPETITION              v1 published     v2 replayed     v2 declined");
  for (const [lg, r] of [...byLeague].sort((a, b) => (b[1].v1w + b[1].v1l) - (a[1].v1w + a[1].v1l))) {
    console.log(`  ${lg.slice(0, 40).padEnd(40)} ${`${r.v1w}-${r.v1l}`.padStart(6)} ${pct(r.v1w, r.v1l).padStart(6)}   ${`${r.v2w}-${r.v2l}`.padStart(6)} ${pct(r.v2w, r.v2l).padStart(6)}   ${r.dec}`);
  }
  console.log("\nEVERY PICK");
  for (const l of lines) console.log("  " + l);
}

void main();
