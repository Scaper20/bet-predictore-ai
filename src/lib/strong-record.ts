/** Fewer graded Strong picks than this and the record says too little to quote. */
export const MIN_RECORD_SAMPLE = 20;

/**
 * The Strong picks' recent record as one line ("54 of 66 landed in the last
 * 30 days, 82%"), or null when there are too few to mean anything. Read live
 * from the track record, so a pitch can never quote a number that has gone
 * stale or was never true.
 */
export function strongRecordLine(rec: { wins: number; sample: number }, days = 30): string | null {
  if (rec.sample < MIN_RECORD_SAMPLE) return null;
  return `${rec.wins} of ${rec.sample} landed in the last ${days} days, ${Math.round((rec.wins / rec.sample) * 100)}%`;
}
