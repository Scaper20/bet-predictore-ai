/**
 * Fills historical_results with complete season histories.
 *
 * The problem this exists for: measured through getSeasonResults(), every
 * competition in the catalogue was training on 15-35 completed matches.
 * Capping the backtest's training window to that depth puts the model at 51.6%
 * accuracy while it claims 74.5% — against 66.3% claiming 67.3% on full
 * history. That is a supply problem, not a modelling one, and no free live
 * feed will fix it: TheSportsDB's public key truncates a season to ~15 rows,
 * and SportAPI7's free tier allows fifty requests a month against the thirteen
 * pages one season costs.
 *
 * The way out is that a completed match never changes its score. Fetch it once,
 * store it, and a monthly quota stops being a ceiling on model quality.
 *
 * Sources, chosen so the scarce one is spent only where nothing else reaches:
 *
 *   football-data.co.uk   free, no key, no rate limit, complete seasons with
 *                         closing prices. Covers nine of the twelve leagues.
 *   SportAPI7             fifty requests a month. Reserved for NPFL, the CAF
 *                         Champions League and the UCL — the three the free
 *                         archive does not carry, and the two that differentiate
 *                         this product.
 *
 * Talks to PostgREST over fetch rather than @supabase/supabase-js, for the
 * reasons in scripts/backfill-league-codes.ts: createClient builds a
 * RealtimeClient eagerly and throws on Node 20, and src/lib/supabase/admin.ts
 * starts with `import "server-only"`.
 *
 * Usage:
 *   npx tsx scripts/backfill-history.ts                      # report only
 *   npx tsx scripts/backfill-history.ts --apply
 *   npx tsx scripts/backfill-history.ts --apply --seasons=4
 *   npx tsx scripts/backfill-history.ts --apply --only=npfl  # spends SportAPI7 quota
 */

import { config } from "dotenv";
import { LEAGUES, type LeagueDef } from "../src/lib/leagues";
import {
  dedupe,
  parseCountryCsv,
  parseDivisionCsv,
  type ArchiveRow,
} from "../src/lib/archive/football-data-uk";

config({ path: ".env", quiet: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const RAPID = process.env.RAPIDAPI_KEY;

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const SEASONS = Number(arg("seasons") ?? 3);
const ONLY = arg("only")?.split(",");

/** PostgREST accepts large bodies, but a huge single insert is a slow retry. */
const CHUNK = 500;

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!r.ok) {
    const body = await r.text();
    if (body.includes("historical_results")) {
      throw new Error(
        "historical_results does not exist yet — apply " +
          "supabase/migrations/0014_historical_results.sql in the Supabase SQL editor first.",
      );
    }
    throw new Error(`${init.method ?? "GET"} ${path} → ${r.status} ${body}`);
  }
  return r;
}

/** The seasons football-data.co.uk names, newest first: "2526", "2425", ... */
function seasonCodes(count: number, now = new Date()): string[] {
  const out: string[] = [];
  // Their season flips in August, so before then the current file is last
  // year's label.
  const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let i = 0; i < count; i++) {
    const a = String(startYear - i).slice(2);
    const b = String(startYear - i + 1).slice(2);
    out.push(`${a}${b}`);
  }
  return out;
}

async function text(url: string): Promise<string | null> {
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) return null;
  return r.text();
}

async function fromFootballDataUk(league: LeagueDef): Promise<ArchiveRow[]> {
  const rows: ArchiveRow[] = [];

  const div = league.archive?.footballDataUk;
  if (div) {
    for (const season of seasonCodes(SEASONS)) {
      const body = await text(`https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`);
      if (body) rows.push(...parseDivisionCsv(body, league.code));
    }
  }

  const country = league.archive?.footballDataUkCountry;
  if (country) {
    // One file holds every season, so this is a single request regardless of
    // how many seasons are asked for.
    const body = await text(`https://www.football-data.co.uk/new/${country.file}.csv`);
    if (body) {
      const all = parseCountryCsv(body, league.code, country.league);
      const cutoff = Date.now() - SEASONS * 400 * 86_400_000;
      rows.push(...all.filter((r) => r.kickoff >= cutoff));
    }
  }

  return rows;
}

/**
 * SportAPI7, for competitions no free archive carries.
 *
 * Every call is metered against fifty a month, so this reports what it spent
 * and refuses to start without a key rather than burning requests on a 403.
 */
async function fromSportApi(league: LeagueDef): Promise<{ rows: ArchiveRow[]; calls: number }> {
  const id = league.archive?.sportApi;
  if (!id) return { rows: [], calls: 0 };
  if (!RAPID) {
    console.log(`    RAPIDAPI_KEY not set — skipping ${league.shortName}`);
    return { rows: [], calls: 0 };
  }

  const H = {
    "x-rapidapi-key": RAPID,
    "x-rapidapi-host": "sportapi7.p.rapidapi.com",
  };
  const B = "https://sportapi7.p.rapidapi.com/api/v1";
  let calls = 0;

  const seasons = await fetch(`${B}/unique-tournament/${id}/seasons`, { headers: H })
    .then((r) => (calls++, r.ok ? r.json() : null))
    .catch(() => null);
  const list = (seasons?.seasons ?? []).slice(0, SEASONS);
  if (list.length === 0) return { rows: [], calls };

  const rows: ArchiveRow[] = [];
  for (const season of list) {
    // Pages are 30 events each; a domestic season runs to about thirteen.
    for (let page = 0; page < 20; page++) {
      const r = await fetch(
        `${B}/unique-tournament/${id}/season/${season.id}/events/last/${page}`,
        { headers: H },
      ).catch(() => null);
      calls++;
      if (!r?.ok) break;
      const j = await r.json();
      for (const e of j.events ?? []) {
        // Only finished matches, and only with a real scoreline.
        if (e.status?.type !== "finished") continue;
        const hg = e.homeScore?.current;
        const ag = e.awayScore?.current;
        if (!Number.isInteger(hg) || !Number.isInteger(ag)) continue;
        rows.push({
          leagueCode: league.code,
          kickoff: e.startTimestamp * 1000,
          homeName: String(e.homeTeam?.name ?? "").trim(),
          awayName: String(e.awayTeam?.name ?? "").trim(),
          homeGoals: hg,
          awayGoals: ag,
        });
      }
      if (!j.hasNextPage) break;
    }
  }

  return { rows: rows.filter((r) => r.homeName && r.awayName), calls };
}

async function upsert(rows: ArchiveRow[], source: string): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      league_code: r.leagueCode,
      kickoff: new Date(r.kickoff).toISOString(),
      home_name: r.homeName,
      away_name: r.awayName,
      home_goals: r.homeGoals,
      away_goals: r.awayGoals,
      source,
    }));
    await rest("historical_results", {
      method: "POST",
      body: JSON.stringify(chunk),
      // The natural key is (league_code, kickoff::date, home, away); a rerun
      // must be a no-op rather than a duplicate-key failure.
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    });
  }
}

async function main() {
  if (!URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and a service-role key are required");

  const leagues = LEAGUES.filter(
    (l) => l.archive && (!ONLY || ONLY.includes(l.code)),
  );

  console.log(`Backfilling ${leagues.length} competitions, ${SEASONS} seasons each\n`);
  let total = 0;
  let sportApiCalls = 0;

  for (const league of leagues) {
    const free = await fromFootballDataUk(league);
    const metered = free.length > 0
      ? { rows: [] as ArchiveRow[], calls: 0 }
      : await fromSportApi(league);
    sportApiCalls += metered.calls;

    const rows = dedupe([...free, ...metered.rows]);
    const source = free.length > 0 ? "football-data.co.uk" : "sportapi7";
    total += rows.length;

    const span = rows.length
      ? `${new Date(rows[0].kickoff).toISOString().slice(0, 10)} → ${new Date(rows[rows.length - 1].kickoff).toISOString().slice(0, 10)}`
      : "—";
    console.log(
      `  ${league.shortName.padEnd(16)} ${String(rows.length).padStart(5)} rows  ${source.padEnd(20)} ${span}` +
        (metered.calls ? `  [${metered.calls} SportAPI7 calls]` : ""),
    );

    if (APPLY && rows.length) await upsert(rows, source);
  }

  console.log(`\n  ${total} rows total`);
  if (sportApiCalls) console.log(`  ${sportApiCalls} SportAPI7 requests spent (50/month free tier)`);
  if (!APPLY) console.log("\nDry run. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
