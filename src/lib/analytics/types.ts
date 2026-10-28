/** Shared shapes for the admin traffic page's outside sources (Google, Vercel). */

export interface Ranked {
  label: string;
  value: number;
}

export interface DailyPoint {
  /** ISO day (yyyy-mm-dd). */
  day: string;
  value: number;
}

/**
 * What a source returned: its numbers, a note that it isn't connected yet
 * (with the env vars it is missing), or the error it raised.
 */
export type SourceResult<T> =
  | { state: "ok"; data: T; fetchedAt: string }
  | { state: "unconfigured"; missing: string[] }
  | { state: "error"; message: string };

export const RANGE_DAYS = 28;

/** Turns a loader's failure into an error result, so one source failing never takes the page down. */
export async function settle<T>(load: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { state: "ok", data: await load(), fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { state: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
