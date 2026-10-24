import "server-only";

import { getLive, getMatch } from "@/lib/providers";
import { cached } from "@/lib/providers/cache";
import { supabasePublic } from "@/lib/supabase/public";
import type { Match } from "@/lib/types";
import type { LegScore } from "@/lib/slip-tracker";
import { espnCountsFor } from "@/lib/stat-results";

/**
 * Current score and status for a set of matches, for the tracked-slip status
 * route (api/slip/status) and the push dispatcher that grades slips while
 * the app is closed (push/events.ts). Only public fixture data.
 *
 * Cheapest source first, because the football feeds are rate limited:
 * 1. match_results: finished games already captured by the live board or
 *    the settlement cron;
 * 2. the live feed, one shared cached call for every id at once;
 * 3. a per-match lookup, cached for a minute, for whatever is left.
 * Corners and shots counts (ESPN) are added for finished matches asked for
 * in `statIds`.
 */
export async function legScoresFor(
  ids: readonly string[],
  statIds: ReadonlySet<string> = new Set(),
): Promise<{ scores: Record<string, LegScore>; finished: Match[] }> {
  const out: Record<string, LegScore> = {};
  if (ids.length === 0) return { scores: out, finished: [] };

  const db = supabasePublic();
  if (db) {
    const { data } = await db
      .from("match_results")
      .select("match_id, status, home_goals, away_goals")
      .in("match_id", [...ids])
      .eq("status", "finished");
    for (const row of data ?? []) {
      out[row.match_id as string] = {
        status: "finished",
        home: row.home_goals as number | null,
        away: row.away_goals as number | null,
      };
    }
  }

  let remaining = ids.filter((id) => !out[id]);
  if (remaining.length > 0) {
    const live = await cached("slip-status:live", 20_000, getLive).catch(() => [] as Match[]);
    const byId = new Map(live.map((m) => [m.id, m]));
    for (const id of remaining) {
      const m = byId.get(id);
      if (m) out[id] = toScore(m);
    }
    remaining = remaining.filter((id) => !out[id]);
  }

  const finished: Match[] = [];
  const looked = await Promise.all(
    remaining.map((id) => cached(`slip-status:match:${id}`, 60_000, () => getMatch(id)).catch(() => null)),
  );
  for (const [i, m] of looked.entries()) {
    if (!m) continue;
    out[remaining[i]] = toScore(m);
    if (m.status === "finished") finished.push(m);
  }

  // Corners and shots counts for finished matches that need them (ESPN, shared per competition-day).
  const wantStats = [...statIds].filter((id) => out[id]?.status === "finished");
  if (wantStats.length > 0) {
    await Promise.all(
      wantStats.map(async (id) => {
        const m = await cached(`slip-status:match:${id}`, 60_000, () => getMatch(id)).catch(() => null);
        const counts = m ? await espnCountsFor(m).catch(() => null) : null;
        if (counts) out[id] = { ...out[id], stats: counts };
      }),
    );
  }

  return { scores: out, finished };
}

function toScore(m: Match): LegScore {
  return { status: m.status, minute: m.minute ?? null, home: m.score.home, away: m.score.away };
}
