/** The fields live-scores writes, as the matches table holds them. */
export interface StoredScore {
  status: string;
  minute: number | null;
  home_goals: number | null;
  away_goals: number | null;
  score_source: string | null;
}

/**
 * True when writing `next` would leave the row as it is.
 *
 * The feed keeps listing a game for a while after it ends and re-sends it
 * every minute. Writing it again changes nothing but updated_at, which costs
 * a commit and wakes the push check (migration 0074) for a game that has not
 * moved. Pure and import-free so the tests can load it outside Deno.
 */
export function unchanged(stored: StoredScore, next: StoredScore): boolean {
  return (
    stored.status === next.status &&
    stored.minute === next.minute &&
    stored.home_goals === next.home_goals &&
    stored.away_goals === next.away_goals &&
    stored.score_source === next.score_source
  );
}
