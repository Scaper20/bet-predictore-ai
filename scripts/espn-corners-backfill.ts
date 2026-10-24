/**
 * One-off: corners from ESPN for archived games that have none, in the
 * competitions football-data.co.uk carries no corners for
 * (ESPN_CORNER_LEAGUES). The corners model needs 200 games of a competition
 * before it prices anything (stat-markets-service.ts MIN_MATCHES), so this
 * fills the last three seasons; the nightly refreshEspnCorners keeps them up.
 *
 * Reads with the publishable key and writes one UPDATE file per competition
 * to <out-dir>, for running in the SQL editor:
 *
 *   set -a; . ./.env.local; set +a; npx tsx scripts/espn-corners-backfill.ts <out-dir> [league ...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESPN_CORNER_LEAGUES, espnDay, matchCorners, type ArchiveRow, type EspnResult } from "../src/lib/archive/espn-shots";

const SINCE = "2024-01-01";
const CONCURRENCY = 4;

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
      `${url}/rest/v1/historical_results?select=id,kickoff,home_name,away_name,home_goals,away_goals&league_code=eq.${league}&home_corners=is.null&kickoff=gte.${SINCE}&order=kickoff.asc`,
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

async function main() {
  const [outDir, ...only] = process.argv.slice(2);
  if (!outDir) throw new Error("usage: espn-corners-backfill.ts <out-dir> [league ...]");
  mkdirSync(outDir, { recursive: true });
  for (const [league, slug] of Object.entries(ESPN_CORNER_LEAGUES)) {
    if (only.length && !only.includes(league)) continue;
    const rows = await unfilled(league);
    if (!rows.length) {
      console.log(`${league}: nothing to fill`);
      continue;
    }
    const games = await espnFor(slug, rows);
    const updates = matchCorners(games, rows);
    console.log(`${league}: ${rows.length} rows without corners, ${games.length} ESPN games, ${updates.length} matched`);
    if (!updates.length) continue;
    const values = updates.map((u) => `('${u.id}'::uuid, ${u.hc}, ${u.ac})`).join(",\n");
    writeFileSync(
      join(outDir, `${league}.sql`),
      `update public.historical_results h set home_corners = v.hc, away_corners = v.ac\nfrom (values\n${values}\n) as v(id, hc, ac)\nwhere h.id = v.id and h.home_corners is null;\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
