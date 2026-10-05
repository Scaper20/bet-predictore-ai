/**
 * Writes the league catalogue for the Python ingestion package.
 *
 *   npx tsx scripts/export-leagues.ts
 *
 * src/lib/leagues.ts stays the one place competitions and their source ids
 * are defined; ingestion/betrix_ingest/leagues.json is generated from it, and
 * src/lib/league-export.test.ts fails if the two drift apart.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { leagueCatalogueJson } from "../src/lib/league-export";

const out = join(__dirname, "..", "ingestion", "betrix_ingest", "leagues.json");
writeFileSync(out, leagueCatalogueJson());
console.log(`wrote ${out}`);
