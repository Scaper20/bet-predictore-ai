import "server-only";

import { cached } from "@/lib/providers/cache";
import { dataLayer } from "@/lib/providers/data-layer";

/**
 * Stored odds boards (public.odds_boards), written by /api/cron/odds-snapshot.
 *
 * ``fromLayer`` is what the odds modules call: in live mode it fetches as
 * before; in db modes it answers from the stored board, and in db_fallback a
 * missing board falls back to fetching.
 */

export interface StoredBoard<T> {
  payload: T;
  meta: Record<string, unknown>;
  fetchedAt: number;
}

export async function readBoard<T>(key: string): Promise<StoredBoard<T> | null> {
  return cached(`board:${key}`, 60_000, async () => {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const { data } = await supabaseAdmin()
        .from("odds_boards")
        .select("payload, meta, fetched_at")
        .eq("key", key)
        .maybeSingle();
      return data
        ? { payload: data.payload as T, meta: (data.meta ?? {}) as Record<string, unknown>, fetchedAt: Date.parse(data.fetched_at) }
        : null;
    } catch {
      return null;
    }
  });
}

export async function writeBoard(key: string, source: string, payload: unknown, meta: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const { error } = await supabaseAdmin()
    .from("odds_boards")
    .upsert({ key, source, payload, meta, fetched_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`odds board ${key}: ${error.message}`);
}

export async function fromLayer<T>(key: string, empty: T, fetchLive: () => Promise<T>): Promise<T> {
  const mode = await dataLayer();
  if (mode === "live") return fetchLive();
  const stored = await readBoard<T>(key);
  if (stored) return stored.payload;
  return mode === "db" ? empty : fetchLive();
}
