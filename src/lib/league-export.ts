import { LEAGUES } from "@/lib/leagues";

/**
 * The league catalogue as the ingestion package reads it
 * (ingestion/betrix_ingest/leagues.json). Kept to the fields ingestion uses,
 * so presentation-only edits to leagues.ts don't churn the export.
 */
export function leagueCatalogueJson(): string {
  const rows = LEAGUES.map((l) => ({
    code: l.code,
    sport: l.sport,
    name: l.name,
    country: l.country,
    international: Boolean(l.confederation),
    ids: l.ids,
    archive: l.archive ?? {},
    // Who writes this league's finished results into historical_results
    // (see competitions.history_owner in migration 0029).
    historyOwner: l.archive?.footballDataUk || l.archive?.footballDataUkCountry ? "football-data-uk" : "matches",
  }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}
