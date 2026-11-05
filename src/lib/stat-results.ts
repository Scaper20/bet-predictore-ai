import "server-only";

import { cached } from "@/lib/providers/cache";
import { espnDay, espnStatsComplete, findEspnGame, type EspnResult } from "@/lib/archive/espn-shots";
import { leagueByCode } from "@/lib/leagues";
import { evaluateStatPick, statKindOf, type PickResult } from "@/lib/settlement";
import { gradePick, halftimeOf } from "@/lib/pick-grade";
import { isRawMarket } from "@/lib/odds/markets";
import type { Match } from "@/lib/types";

/**
 * Grades for corners, shots and shots-on-target picks straight after full
 * time, from ESPN's scoreboard, which has the counts within minutes. The
 * archive (football-data.co.uk) that the daily sweep waits for takes two to
 * five days.
 *
 * ESPN's counts are taken as final, close calls included, the same rule
 * settlement uses (settlement-runner.ts gradeFromStats), so the page and the
 * record cannot disagree.
 */

export type StatCounts = Record<"corners" | "shots" | "shotsOnTarget", [number, number]>;

/** One competition-day from ESPN, shared for five minutes; an empty answer is retried sooner. */
function day(slug: string, d: Date): Promise<EspnResult[]> {
  const key = `espn-day:${slug}:${d.toISOString().slice(0, 10)}`;
  return cached(key, 5 * 60_000, () => espnDay(slug, d)).catch(() => []);
}

/** One competition-day from ESPN with games still in play, shared for a minute. */
function liveDay(slug: string, d: Date): Promise<EspnResult[]> {
  const key = `espn-live:${slug}:${d.toISOString().slice(0, 10)}`;
  return cached(key, 60_000, () => espnDay(slug, d, { live: true })).catch(() => []);
}

/**
 * A match's corners and shots counts from ESPN: complete ones for a finished
 * match (the grading rule), and whatever ESPN has so far for a game in play,
 * for display only. Null when ESPN has nothing for it.
 */
export async function espnCountsFor(
  m: Pick<Match, "kickoff" | "home" | "away" | "score" | "league"> & { status?: Match["status"] },
): Promise<StatCounts | null> {
  const slug = m.league.code ? leagueByCode(m.league.code)?.ids.espn : undefined;
  if (!slug || m.score.home === null || m.score.away === null) return null;
  const inPlay = m.status === "live" || m.status === "halftime";
  const at = Date.parse(m.kickoff);
  const fetchDay = inPlay ? liveDay : day;
  // ESPN dates games by US time, so a late kick-off can sit on the day before.
  const games = (await Promise.all([fetchDay(slug, new Date(at)), fetchDay(slug, new Date(at - 86_400_000))])).flat();
  const g = findEspnGame(games, { home: m.home.name, away: m.away.name, kickoff: at, hg: m.score.home, ag: m.score.away });
  if (!g) return null;
  const all = [g.hc, g.ac, g.hs, g.as, g.hsot, g.asot];
  if (inPlay ? all.some((x) => x === undefined) : !espnStatsComplete(g)) return null;
  return { corners: [g.hc!, g.ac!], shots: [g.hs!, g.as!], shotsOnTarget: [g.hsot!, g.asot!] };
}

/** A stat pick's grade from ESPN's counts. */
export function statOutcome(market: string, counts: StatCounts | null): PickResult | null {
  const kind = statKindOf(market);
  if (!kind || !counts) return null;
  const [h, a] = counts[kind];
  return evaluateStatPick(market, h, a);
}

/** Fills in the outcome of any stat pick, and of any halves pick, on a finished match that has none yet. */
export async function withStatOutcomes<T extends { market: string; outcome?: PickResult }>(
  picks: T[],
  m: Pick<Match, "id" | "kickoff" | "home" | "away" | "score" | "league" | "status" | "halftime">,
): Promise<T[]> {
  if (m.status !== "finished") return picks;
  let out = picks;

  // Halves markets: the half-time score stored at the break (match_results).
  if (out.some((p) => !p.outcome && isRawMarket(p.market)) && m.score.home !== null && m.score.away !== null) {
    const ht = halftimeOf(m.halftime) ?? (await storedHalfTime(m.id));
    out = out.map((p) => {
      if (p.outcome || !isRawMarket(p.market)) return p;
      const outcome = gradePick(p.market, m.score.home!, m.score.away!, ht);
      return outcome ? { ...p, outcome } : p;
    });
  }

  if (!out.some((p) => !p.outcome && statKindOf(p.market))) return out;
  const counts = await espnCountsFor(m).catch(() => null);
  if (!counts) return out;
  return out.map((p) => {
    if (p.outcome || !statKindOf(p.market)) return p;
    const outcome = statOutcome(p.market, counts);
    return outcome ? { ...p, outcome } : p;
  });
}

/** The half-time score stored with the final score, if it was captured at the break. */
async function storedHalfTime(matchId: string): Promise<{ home: number; away: number } | null> {
  try {
    const { supabasePublic } = await import("@/lib/supabase/public");
    const db = supabasePublic();
    if (!db) return null;
    const { data } = await db.from("match_results").select("ht_home, ht_away").eq("match_id", matchId).maybeSingle();
    return halftimeOf({ home: data?.ht_home ?? null, away: data?.ht_away ?? null });
  } catch {
    return null;
  }
}
