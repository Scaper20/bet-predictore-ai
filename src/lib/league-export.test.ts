import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leagueCatalogueJson } from "./league-export";

describe("ingestion league catalogue", () => {
  it("matches src/lib/leagues.ts (run `npx tsx scripts/export-leagues.ts` after editing leagues)", () => {
    const committed = readFileSync(join(__dirname, "..", "..", "ingestion", "betrix_ingest", "leagues.json"), "utf8");
    expect(committed).toBe(leagueCatalogueJson());
  });
});
