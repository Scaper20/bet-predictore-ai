/**
 * One-off: matches the cached ESPN results (scripts/lib/espn.ts) to archive
 * rows without shots on target and writes one UPDATE per competition to a
 * folder, for running in the SQL editor. Reads with the publishable key.
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/espn-shots-backfill.ts <out-dir>
 *
 * The nightly top-up after this is refreshEspnShots (src/lib/archive/refresh.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESPN_SHOT_LEAGUES, matchShots, type ArchiveRow } from "../src/lib/archive/espn-shots";
import { espnGames } from "./lib/espn";

interface Raw {
  id: string;
  kickoff: string;
  home_name: string;
  away_name: string;
  home_goals: number;
  away_goals: number;
}

async function unfilled(league: string): Promise<ArchiveRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const out: ArchiveRow[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${url}/rest/v1/historical_results?select=id,kickoff,home_name,away_name,home_goals,away_goals&league_code=eq.${league}&home_shots_on_target=is.null&kickoff=gte.2024-04-01&order=kickoff.asc`,
      { headers: { apikey: key, Range: `${from}-${from + 999}` } },
    );
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const page = (await r.json()) as Raw[];
    for (const x of page) {
      if (!Number.isFinite(x.home_goals) || !Number.isFinite(x.away_goals)) continue;
      out.push({ id: x.id, kickoff: Date.parse(x.kickoff), home: x.home_name, away: x.away_name, hg: x.home_goals, ag: x.away_goals });
    }
    if (page.length < 1000) break;
  }
  return out;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Pass an output folder");
  mkdirSync(dir, { recursive: true });
  for (const [league, slug] of Object.entries(ESPN_SHOT_LEAGUES)) {
    const [rows, espn] = await Promise.all([unfilled(league), espnGames(slug)]);
    const updates = matchShots(espn, rows);
    const games = espn.filter((g) => g.hsot !== undefined).length;
    console.log(`${league.padEnd(28)} rows without shots ${String(rows.length).padStart(5)}   ESPN games ${String(games).padStart(5)}   matched ${String(updates.length).padStart(5)}`);

    // Compact enough to paste: the first eight characters of the row id
    // (checked unique among the competition's unfilled rows) and the counts.
    if (new Set(rows.map((r) => r.id.slice(0, 8))).size !== rows.length) throw new Error(`${league}: id prefixes collide`);
    const list = updates.map((u) => `${u.id.slice(0, 8)}:${u.hsot}:${u.asot}`).join(",");
    writeFileSync(
      join(dir, `${league}.sql`),
      `update historical_results h
set home_shots_on_target = split_part(x, ':', 2)::smallint, away_shots_on_target = split_part(x, ':', 3)::smallint
from string_to_table('${list}', ',') as x
where h.league_code = '${league}' and h.home_shots_on_target is null and left(h.id::text, 8) = split_part(x, ':', 1);
`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
