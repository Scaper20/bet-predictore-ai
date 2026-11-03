import "server-only";

import { cached } from "@/lib/providers/cache";

/**
 * Operator switches flipped from /admin (public.app_switches, migration 0055).
 *
 * Read through the service role and held in memory for a few seconds, so a
 * busy page costs one database read per instance rather than one per render,
 * and a flip reaches every instance within SWITCH_TTL_MS. A missing row, a
 * missing table or an unreachable database all read as off: both switches
 * guard something that should fail closed (spending credits, opening a page).
 *
 * The exception is sportybet_direct, which reads as ON when it has no row:
 * calling SportyBet directly costs nothing, and "off" there means no prices
 * and no booking codes at all. It is a brake for when SportyBet objects, not
 * a guard on spending.
 *
 * headline_engine publishes the headline engine's pick (engine-feed.ts) in
 * place of the model's own; off, the engine is only logged beside it.
 *
 * fotmob_ui shows what FotMob's match details feed (lineups, timeline, shot
 * map, team stats, club profiles). Like sportybet_direct it reads as ON with
 * no row: it is a brake for a broken or withdrawn feed, and with no data the
 * sections already render nothing. lineup_adjust lets lineups move the
 * model's numbers; it fails closed (migration 0091).
 */

export type SwitchKey =
  | "parsebot_live"
  | "code_hub_open"
  | "sportybet_direct"
  | "headline_engine"
  | "fotmob_ui"
  | "lineup_adjust";

export const SWITCH_TTL_MS = 15_000;

export interface SwitchState {
  enabled: boolean;
  updatedAt: string | null;
}

async function readAll(): Promise<Record<SwitchKey, SwitchState>> {
  const off: Record<SwitchKey, SwitchState> = {
    parsebot_live: { enabled: false, updatedAt: null },
    code_hub_open: { enabled: false, updatedAt: null },
    sportybet_direct: { enabled: true, updatedAt: null },
    headline_engine: { enabled: false, updatedAt: null },
    fotmob_ui: { enabled: true, updatedAt: null },
    lineup_adjust: { enabled: false, updatedAt: null },
  };
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin().from("app_switches").select("key, enabled, updated_at");
    if (error || !data) return off;
    for (const row of data) {
      if (row.key in off) off[row.key as SwitchKey] = { enabled: row.enabled === true, updatedAt: row.updated_at };
    }
    return off;
  } catch {
    return off;
  }
}

/** Every switch, cached briefly. */
export function switches(): Promise<Record<SwitchKey, SwitchState>> {
  return cached("app-switches", SWITCH_TTL_MS, readAll);
}

export async function switchOn(key: SwitchKey): Promise<boolean> {
  return (await switches())[key].enabled;
}

/** Every switch, read fresh: for the admin page, which must show what is stored now. */
export function switchesFresh(): Promise<Record<SwitchKey, SwitchState>> {
  return readAll();
}
