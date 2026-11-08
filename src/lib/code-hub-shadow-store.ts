import "server-only";

import type { PoolEntry } from "@/lib/forge";
import { hubTotals, toHubLeg } from "@/lib/code-hub";
import { buildShadowHub, SHADOW_VARIANT, teamRecords, type SettledPick } from "@/lib/code-hub-shadow";

/** Far enough back for eight picks on every team, with international breaks. */
const LOOKBACK_DAYS = 150;
const PAGE = 1000;

/**
 * Builds and stores the day's shadow hub (code-hub-shadow.ts) from the pool
 * the real hub was just built from. Best effort: any failure, including a
 * missing table before 0105, leaves the real hub untouched. Idempotent: a
 * day already stored is not overwritten.
 */
export async function recordShadowHub(pool: PoolEntry[], day: string): Promise<void> {
  if (pool.length === 0) return;
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const db = supabaseAdmin();
  const leagues = [...new Set(pool.map((e) => e.prediction.match.league.code).filter((c): c is string => Boolean(c)))];
  if (leagues.length === 0) return;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const picks: SettledPick[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("predictions_log")
      .select("league_code, home_name, away_name, kickoff, result")
      .in("league_code", leagues)
      .in("result", ["win", "lose"])
      .gte("kickoff", since)
      .order("kickoff", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) return;
    for (const r of data as { league_code: string | null; home_name: string; away_name: string; kickoff: string; result: string }[]) {
      picks.push({ leagueCode: r.league_code, homeName: r.home_name, awayName: r.away_name, kickoff: r.kickoff, won: r.result === "win" });
    }
    if (data.length < PAGE) break;
  }
  const codes = buildShadowHub(pool, day, teamRecords(picks));
  if (codes.length === 0) return;
  await db.from("code_hub_shadow").upsert(
    codes.map(({ tier, legs }) => {
      const hubLegs = legs.map(toHubLeg);
      const t = hubTotals(hubLegs);
      return {
        day,
        variant: SHADOW_VARIANT,
        tier,
        legs: hubLegs,
        odds: Math.round(t.odds * 100) / 100,
        probability: Math.round(t.probability * 1e5) / 1e5,
        first_kickoff: new Date(t.firstKickoff).toISOString(),
        last_kickoff: new Date(t.lastKickoff).toISOString(),
      };
    }),
    { onConflict: "day,variant,tier", ignoreDuplicates: true },
  );
}

