/**
 * One-off repair for 0013: fills predictions_log.league_code and
 * match_results.league_code on rows written before the column existed.
 *
 * The app does not depend on this having run — performance-store.ts resolves
 * a missing code from the stored display name through the same alias table
 * (src/lib/leagues.ts), so the aggregates are correct either way. This exists
 * so the column itself is trustworthy for direct SQL, the admin surfaces and
 * any future index-backed filter, rather than being right only when read
 * through one module.
 *
 * Talks to PostgREST over fetch rather than through @supabase/supabase-js.
 * Two reasons: createClient constructs a RealtimeClient eagerly, which throws
 * on Node 20 for want of a global WebSocket (this is a maintenance script, not
 * a deploy artifact, so it has to run on whatever Node the developer has); and
 * importing src/lib/supabase/admin.ts is out anyway because it starts with
 * `import "server-only"`, which throws outside a react-server bundling
 * context. Same constraint as scripts/create-admin.ts, one step further.
 *
 * Usage:
 *   npx tsx scripts/backfill-league-codes.ts          # report only
 *   npx tsx scripts/backfill-league-codes.ts --apply  # write
 */

import { config } from "dotenv";
import { leagueByProviderName } from "../src/lib/leagues";

config({ path: ".env", quiet: true });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const APPLY = process.argv.includes("--apply");

const TABLES = ["predictions_log", "match_results"] as const;

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    if (body.includes("league_code")) {
      throw new Error(
        "predictions_log.league_code does not exist yet — apply " +
          "supabase/migrations/0013_league_code.sql in the Supabase SQL editor first.",
      );
    }
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${body}`);
  }
  return response;
}

async function main() {
  if (!URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and a service-role key are required");

  for (const table of TABLES) {
    const response = await rest(`${table}?select=league&league_code=is.null&limit=10000`);
    const rows = (await response.json()) as { league: string }[];

    // One update per distinct competition name rather than per row: a dozen
    // statements instead of several hundred, and the report then reads as the
    // mapping decision it actually is.
    const byName = new Map<string, number>();
    for (const r of rows) byName.set(r.league, (byName.get(r.league) ?? 0) + 1);

    console.log(`\n${table}: ${rows.length} rows with no league_code`);
    let resolved = 0;
    let unresolved = 0;

    for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1])) {
      const def = leagueByProviderName(name);
      if (!def) {
        unresolved += count;
        console.log(`  ${String(count).padStart(4)}  "${name}"  → (not catalogued)`);
        continue;
      }
      resolved += count;
      console.log(`  ${String(count).padStart(4)}  "${name}"  → ${def.code}`);

      if (APPLY) {
        await rest(
          `${table}?league=eq.${encodeURIComponent(name)}&league_code=is.null`,
          {
            method: "PATCH",
            body: JSON.stringify({ league_code: def.code }),
            headers: { Prefer: "return=minimal" },
          },
        );
      }
    }

    console.log(
      `  ${resolved} resolved, ${unresolved} left null (competitions outside src/lib/leagues.ts)`,
    );
  }

  if (!APPLY) console.log("\nDry run. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
