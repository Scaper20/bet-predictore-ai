/**
 * One-off: goal timelines from ESPN for archived games (0078_goal_timelines.sql),
 * so the goal-timing estimate (src/lib/model/lead-process.ts) can be
 * backtested; the nightly refreshEspnGoals keeps them up.
 *
 * Reads the archive with the publishable key and writes INSERT files of at
 * most ~250 KB each to <out-dir>, for running in the SQL editor (existing
 * timelines are left as they are):
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/espn-goals-backfill.ts <out-dir> [since] [league ...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESPN_GOAL_LEAGUES, espnDay, matchGoals, type ArchiveRow, type EspnResult, type GoalUpdate } from "../src/lib/archive/espn-shots";

const CONCURRENCY = 4;
const FILE_BYTES = 250_000;

interface Raw {
  id: string;
  kickoff: string;
  home_name: string;
  away_name: string;
  home_goals: number;
  away_goals: number;
}

async function archived(league: string, since: string): Promise<ArchiveRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const out: ArchiveRow[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(
      `${url}/rest/v1/historical_results?select=id,kickoff,home_name,away_name,home_goals,away_goals&league_code=eq.${league}&kickoff=gte.${since}&order=kickoff.asc`,
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

/** ESPN's games on each date the rows were played (and the day before, for late kick-offs in UTC). */
async function espnFor(slug: string, rows: ArchiveRow[]): Promise<EspnResult[]> {
  const days = new Set<string>();
  for (const r of rows) {
    days.add(new Date(r.kickoff).toISOString().slice(0, 10));
    days.add(new Date(r.kickoff - 86_400_000).toISOString().slice(0, 10));
  }
  const queue = [...days];
  const out: EspnResult[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        out.push(...(await espnDay(slug, new Date(`${d}T12:00:00Z`)).catch(() => [])));
      }
    }),
  );
  return out;
}

function insert(updates: GoalUpdate[]): string {
  const rows = JSON.stringify(updates.map((u) => ({ result_id: u.id, goals: u.goals, ht_home: u.htHome, ht_away: u.htAway })));
  return (
    `insert into public.goal_timelines (result_id, goals, ht_home, ht_away)\n` +
    `select result_id, goals, ht_home, ht_away from jsonb_to_recordset($json$${rows}$json$::jsonb)\n` +
    `  as v(result_id uuid, goals jsonb, ht_home smallint, ht_away smallint)\n` +
    `where exists (select 1 from public.historical_results h where h.id = v.result_id)\n` +
    `on conflict (result_id) do nothing;\n`
  );
}

async function main() {
  const [outDir, since = "2024-07-01", ...only] = process.argv.slice(2);
  if (!outDir) throw new Error("usage: espn-goals-backfill.ts <out-dir> [since] [league ...]");
  mkdirSync(outDir, { recursive: true });
  let batch: GoalUpdate[] = [];
  let file = 0;
  const flush = () => {
    if (!batch.length) return;
    writeFileSync(join(outDir, `goals-${String(++file).padStart(3, "0")}.sql`), insert(batch));
    batch = [];
  };
  for (const [league, slug] of Object.entries(ESPN_GOAL_LEAGUES)) {
    if (only.length && !only.includes(league)) continue;
    const rows = await archived(league, since);
    if (!rows.length) continue;
    const updates = matchGoals(await espnFor(slug, rows), rows);
    console.log(`${league}: ${rows.length} archived, ${updates.length} timelines`);
    for (const u of updates) {
      batch.push(u);
      if (batch.length * 110 > FILE_BYTES) flush();
    }
  }
  flush();
  console.log(`${file} files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
