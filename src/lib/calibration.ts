/**
 * Calibration bucketing and scoring for the Track Record page.
 *
 * Pure data transforms only — no Supabase I/O here, so this stays trivially
 * unit-testable and usable from both the Track Record Server Component
 * (direct call, for the Tier-1 badge) and /api/calibration (for the Tier-2
 * chart panel), guaranteeing both paths report the same numbers.
 */

/** Bucket width in percentage points. Kept narrow-ish deliberately: wider
 * buckets mean more predictions per bucket, which means fewer buckets fall
 * below MIN_BUCKET_SAMPLE and get greyed out — a real product's early
 * settled-prediction volume is limited, and a chart full of hollow markers
 * undermines the exact "we don't cherry-pick" claim this feature exists to
 * make. Tighten toward 5 as settled volume grows. */
export const BUCKET_WIDTH_PCT = 10;

/** Buckets (and the overall score) below this sample size are reported as
 * unreliable rather than hidden — PRD requirement: never silently cherry-pick
 * only the strong buckets. */
export const MIN_BUCKET_SAMPLE = 20;

/** Bump when the bucketing/scoring logic below changes, so a cached or
 * previously-shown score can be traced back to the method that produced it. */
export const CALIBRATION_CALC_VERSION = 1;

export type MarketFamily = "1x2" | "dc" | "btts" | "ou" | "cs";

export const MARKET_FAMILY_LABELS: Record<MarketFamily, string> = {
  "1x2": "Match Result (1X2)",
  dc: "Double Chance",
  btts: "Both Teams to Score",
  ou: "Over/Under Goals",
  cs: "Correct Score",
};

const MARKET_FAMILIES = Object.keys(MARKET_FAMILY_LABELS) as MarketFamily[];

/** The `market` column is a compound string ("1x2:home", "ou:over:2.5", ...)
 * — see evaluatePick() in src/lib/settlement.ts for the exact prefixes this
 * mirrors. Returns null for anything unrecognised rather than guessing. */
export function marketFamily(market: string): MarketFamily | null {
  const prefix = market.split(":")[0];
  return (MARKET_FAMILIES as string[]).includes(prefix) ? (prefix as MarketFamily) : null;
}

export function isMarketFamily(value: string): value is MarketFamily {
  return (MARKET_FAMILIES as string[]).includes(value);
}

export interface GradedPick {
  probability: number;
  result: "win" | "lose" | "push" | null;
}

export interface CalibrationBucket {
  /** Lower edge of the bucket, in percentage points (e.g. 60 for 60–70%). */
  bucket: number;
  n: number;
  meanPredicted: number;
  actualHitRate: number;
  belowThreshold: boolean;
}

export interface CalibrationResult {
  buckets: CalibrationBucket[];
  /** 0–100 "reliability" display score, or null if too little graded data
   * clears MIN_BUCKET_SAMPLE to report one honestly. */
  score: number | null;
  /** Total graded (win/lose) predictions considered, pushes excluded. */
  n: number;
  calcVersion: number;
}

/** Shape returned by GET /api/calibration — shared between the Track Record
 * page's server-computed initial value and the client panel's fetches so
 * both sides agree on one type. */
export type CalibrationApiResponse =
  | ({ available: true; market: MarketFamily | null } & CalibrationResult)
  | { available: false; reason: string; n?: number };

/**
 * Buckets graded picks by predicted probability and scores overall
 * reliability as a sample-size-weighted mean absolute deviation between
 * what was predicted and what actually happened, inverted into a 0–100
 * display score. Pushes are excluded from the denominator — same convention
 * already used for win rate on the Track Record page itself.
 */
export function computeCalibration(rows: GradedPick[]): CalibrationResult {
  const graded = rows.filter((r) => r.result === "win" || r.result === "lose");

  const buckets = new Map<number, { n: number; wins: number; probabilitySum: number }>();
  for (const row of graded) {
    const key = Math.min(90, Math.floor((row.probability * 100) / BUCKET_WIDTH_PCT) * BUCKET_WIDTH_PCT);
    const entry = buckets.get(key) ?? { n: 0, wins: 0, probabilitySum: 0 };
    entry.n += 1;
    entry.wins += row.result === "win" ? 1 : 0;
    entry.probabilitySum += row.probability;
    buckets.set(key, entry);
  }

  const sortedBuckets: CalibrationBucket[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, { n, wins, probabilitySum }]) => ({
      bucket,
      n,
      meanPredicted: probabilitySum / n,
      actualHitRate: wins / n,
      belowThreshold: n < MIN_BUCKET_SAMPLE,
    }));

  const reportable = sortedBuckets.filter((b) => !b.belowThreshold);
  const reportableN = reportable.reduce((sum, b) => sum + b.n, 0);

  let score: number | null = null;
  if (reportableN >= MIN_BUCKET_SAMPLE) {
    const weightedAbsDeviation =
      reportable.reduce((sum, b) => sum + Math.abs(b.meanPredicted - b.actualHitRate) * b.n, 0) / reportableN;
    score = Math.round(Math.max(0, Math.min(1, 1 - weightedAbsDeviation)) * 100);
  }

  return { buckets: sortedBuckets, score, n: graded.length, calcVersion: CALIBRATION_CALC_VERSION };
}
