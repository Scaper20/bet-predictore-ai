import "server-only";

import type { Match } from "@/lib/types";
import { cached } from "@/lib/providers/cache";
import { sourceKeyForId } from "@/lib/providers/db-source";
import { switchOn } from "@/lib/switches";
import { mapMatchDetails, type MatchDetails } from "./match-details-core";
import { mapUsage, sideAvailability, type PlayerUsage, type SideAvailability } from "./model/availability";

export type { MatchDetails } from "./match-details-core";

/**
 * Lineups, timeline, shot map and team stats for one game (FotMob, migration
 * 0091), in one database round trip: match_details_bundle.
 *
 * Read with the public key through that function only; the tables themselves
 * are not readable. Cached per game: a finished game's details are final, so
 * they are held for half an hour; before and during a game, for two minutes,
 * which is how lineups appear when they are announced. Any failure is null:
 * the page then renders exactly what it rendered before this existed.
 */

const FINAL_TTL = 30 * 60_000;
const LIVE_TTL = 2 * 60_000;
const ROW_TTL = 60 * 60_000;

async function client() {
  const { supabasePublic } = await import("@/lib/supabase/public");
  const c = supabasePublic();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

/** The matches.id (uuid) behind a page id ("fd:...", "sdb:...", "db:..."). */
export function matchRowId(publicId: string): Promise<string | null> {
  const key = sourceKeyForId(publicId);
  if (!key) return Promise.resolve(null);
  if (key.kind === "id") return Promise.resolve(key.value);
  return cached(`match-row-id:${publicId}`, ROW_TTL, async () => {
    const c = await client();
    const { data, error } = await c.from("matches").select("id").contains("source_ids", key.value).limit(1);
    if (error) throw error;
    return (data?.[0]?.id as string | undefined) ?? null;
  });
}

export async function matchDetailsFor(match: Match): Promise<MatchDetails | null> {
  try {
    if (!(await switchOn("fotmob_ui"))) return null;
    const rowId = await matchRowId(match.id);
    if (!rowId) return null;
    const started = match.status !== "scheduled" && match.status !== "postponed" && match.status !== "cancelled";
    const settled = match.status === "finished";
    return await cached(`match-details:${rowId}:${settled ? "final" : "open"}`, settled ? FINAL_TTL : LIVE_TTL, async () => {
      const c = await client();
      const { data, error } = await c.rpc("match_details_bundle", { p_match: rowId });
      if (error) throw error;
      return mapMatchDetails(data, started);
    });
  } catch {
    return null;
  }
}

export interface MatchAvailability {
  home: SideAvailability | null;
  away: SideAvailability | null;
}

function usageFor(teamId: string, before: string): Promise<PlayerUsage[]> {
  return cached(`team-usage:${teamId}:${before.slice(0, 13)}`, 30 * 60_000, async () => {
    const c = await client();
    const { data, error } = await c.rpc("team_player_usage", { p_team: teamId, p_before: before, p_games: 6 });
    if (error) throw error;
    return mapUsage(data);
  });
}

/**
 * Who each side is missing and how much of its attack they carry (paid read).
 * Judged against the named eleven only once it is confirmed or played; a
 * predicted or last-game XI is a guess, so before then only the injury and
 * suspension list counts.
 */
export async function availabilityFor(
  match: Match,
  details: MatchDetails | null,
  teamIds: { home: string | null; away: string | null },
): Promise<MatchAvailability | null> {
  if (!details) return null;
  try {
    const xiKnown = details.lineupStatus === "confirmed" || details.lineupStatus === "final";
    const side = async (teamId: string | null, lineup: MatchDetails["home"]) => {
      if (!teamId) return null;
      const usage = await usageFor(teamId, match.kickoff);
      const xi = xiKnown && lineup?.starters.length ? lineup.starters.map((p) => p.id) : null;
      const absent = (lineup?.unavailable ?? []).map((p) => ({ playerId: p.id, kind: p.absence }));
      return sideAvailability(usage, xi, absent);
    };
    const [home, away] = await Promise.all([side(teamIds.home, details.home), side(teamIds.away, details.away)]);
    return home || away ? { home, away } : null;
  } catch {
    return null;
  }
}
