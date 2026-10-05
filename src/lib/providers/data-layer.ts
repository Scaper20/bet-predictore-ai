/**
 * Which layer answers the provider facade (site_settings.data_layer, set from
 * the admin Data health page):
 *
 *   live         the provider APIs, called while the page renders (as before)
 *   db_fallback  the scheduled tables; an empty answer falls back to the APIs
 *   db           the scheduled tables only: no external call at request time
 *
 * DATA_LAYER in the environment overrides the setting (local runs, previews).
 * Anything unreadable means "live": the switch can only ever move a page onto
 * the database deliberately, never by accident.
 */

import { cached } from "./cache";

export type DataLayer = "live" | "db_fallback" | "db";

const MODES: DataLayer[] = ["live", "db_fallback", "db"];
const isMode = (v: unknown): v is DataLayer => typeof v === "string" && (MODES as string[]).includes(v);

export function dataLayer(): Promise<DataLayer> {
  const env = process.env.DATA_LAYER?.trim();
  if (isMode(env)) return Promise.resolve(env);
  return cached("data-layer", 30_000, async () => {
    try {
      const { supabasePublic } = await import("@/lib/supabase/public");
      const c = supabasePublic();
      if (!c) return "live";
      const { data } = await c.from("site_settings").select("data_layer").maybeSingle();
      return isMode(data?.data_layer) ? data.data_layer : "live";
    } catch {
      return "live";
    }
  });
}

/**
 * Runs the database read for db modes, the live read otherwise.
 *
 * In db_fallback an empty or failed database answer falls through to the
 * live read, so a league whose ingestion hasn't run yet still shows games.
 * In db mode it never does: that is the "no external call" guarantee, and a
 * failed read answers ``empty`` (callers already render empty states).
 */
export async function viaLayer<T>(
  fromDb: () => Promise<T>,
  fromLive: () => Promise<T>,
  empty: T,
  isEmpty: (v: T) => boolean,
): Promise<T> {
  const mode = await dataLayer();
  if (mode === "live") return fromLive();
  let value: T | undefined;
  try {
    value = await fromDb();
  } catch {
    value = undefined;
  }
  if (mode === "db") return value ?? empty;
  return value !== undefined && !isEmpty(value) ? value : fromLive();
}
