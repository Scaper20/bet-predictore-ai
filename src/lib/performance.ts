import { ACTIVE_MODEL_ID, isModelId, type ModelId } from "@/lib/model/registry";

/**
 * Published performance: how settled picks are tallied, and when a rate is
 * honest enough to show.
 *
 * Pure on purpose. The Supabase read lives in performance-store.ts, following
 * the split settlement.ts / settlement-runner.ts already uses in this repo —
 * `import "server-only"` throws under vitest's plain-Node environment, so
 * anything that needs a unit test has to stay on this side of the line.
 *
 * The reason this exists at all rather than exporting from admin-analytics.ts:
 * that module computes almost the same shape, but through a service-role
 * client that must never back a page anyone can load, and for an audience
 * allowed to draw its own conclusions from a 2-1 record. A customer-facing
 * page is not. MIN_PUBLISHABLE_SAMPLE below is the difference, and it is the
 * same discipline as `sufficiency.publishable` in the model — withhold rather
 * than publish a number the evidence does not support.
 */

export interface SettledRecord {
  wins: number;
  losses: number;
  pushes: number;
  /** Pushes excluded, matching the convention the KPI cards already use. */
  winRate: number | null;
  /** Graded picks (wins + losses). What the win rate is a rate *of*. */
  sample: number;
}

export interface SettledBreakdown {
  overall: SettledRecord;
  /**
   * Keyed on the league CODE — the catalogue slug, not any provider's display
   * string. See the note on `SettledRow.league_code` for why that distinction
   * is the whole reason this field was ever wrong.
   */
  byLeague: Map<string, SettledRecord>;
  /**
   * Settled picks from competitions outside src/lib/leagues.ts. They are real
   * picks and belong in `overall`; they simply have no slug to file under, so
   * they are counted here rather than dropped or filed under a name.
   */
  uncatalogued: SettledRecord;
  /** Keyed on market family: the part of `market` before the first ":". */
  byMarket: Map<string, SettledRecord>;
  byModel: Map<ModelId, SettledRecord>;
}

/**
 * Below this many graded picks, publish no rate at all.
 *
 * A 2-1 record is not "67% accuracy", and rendering it as one is the same
 * category of error as inventing the number outright. Callers show
 * "not enough settled picks yet" instead.
 */
export const MIN_PUBLISHABLE_SAMPLE = 10;

export const EMPTY_RECORD: SettledRecord = {
  wins: 0,
  losses: 0,
  pushes: 0,
  winRate: null,
  sample: 0,
};

export interface SettledRow {
  /**
   * The catalogue slug, or null for a competition we do not catalogue.
   *
   * NOT the `league` text column, which holds whichever display name the
   * answering provider used — "Premier League" from one feed, "English
   * Premier League" from another, "Primera Division" and "La Liga" for the
   * same Spanish fixtures. Grouping on that string is what made every
   * per-league figure on the site read zero; see 0013_league_code.sql.
   */
  league_code: string | null;
  market: string;
  model_id: string | null;
  result: "win" | "lose" | "push";
}

/** True when a rate derived from this record is safe to show. */
export function isPublishable(record: SettledRecord | undefined): boolean {
  return (record?.sample ?? 0) >= MIN_PUBLISHABLE_SAMPLE;
}

export function tally(rows: SettledRow[]): SettledRecord {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const row of rows) {
    if (row.result === "win") wins++;
    else if (row.result === "lose") losses++;
    else if (row.result === "push") pushes++;
  }
  const sample = wins + losses;
  return { wins, losses, pushes, sample, winRate: sample > 0 ? wins / sample : null };
}

export function summarise(rows: SettledRow[]): SettledBreakdown {
  const byLeague = new Map<string, SettledRow[]>();
  const byMarket = new Map<string, SettledRow[]>();
  const byModel = new Map<ModelId, SettledRow[]>();
  const uncatalogued: SettledRow[] = [];

  for (const row of rows) {
    if (row.league_code) push(byLeague, row.league_code, row);
    else uncatalogued.push(row);

    // Market family, not the full id: "ou:over:2.5" and "ou:under:2.5" are the
    // same product decision and splitting them fragments an already-small
    // sample into buckets that can never clear the publishable floor.
    push(byMarket, row.market.split(":")[0], row);

    // Rows written before 0012 have no model_id; they are all goals-v1 by
    // definition, which is exactly what that migration's DEFAULT encodes.
    const modelId = row.model_id && isModelId(row.model_id) ? row.model_id : ACTIVE_MODEL_ID;
    push(byModel, modelId, row);
  }

  return {
    overall: tally(rows),
    byLeague: mapValues(byLeague),
    uncatalogued: tally(uncatalogued),
    byMarket: mapValues(byMarket),
    byModel: mapValues(byModel),
  };
}

function push<K>(map: Map<K, SettledRow[]>, key: K, row: SettledRow): void {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

function mapValues<K>(groups: Map<K, SettledRow[]>): Map<K, SettledRecord> {
  const out = new Map<K, SettledRecord>();
  for (const [key, rows] of groups) out.set(key, tally(rows));
  return out;
}
