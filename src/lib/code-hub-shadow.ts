/**
 * The Code Hub's team-form shadow run.
 *
 * Every morning, beside the real hub, the same pool is built a second way:
 * each leg's chance is nudged, for choosing only, by how often the two teams'
 * last eight published picks landed. Replayed over three years
 * (scripts/team-form-lab.ts) this was the most promising of twelve team
 * rules: +4.5 codes landed per 100 days, interval -1.8 to +11.1, and worse
 * on the Sep-Oct 2026 window, so not good enough to ship blind. The shadow
 * codes are stored (code_hub_shadow, 0105), never booked or shown, and
 * graded against the real hub on the same days
 * (scripts/sql/code-hub-shadow-score.sql).
 *
 * Pure, so the rule can be tested without the database; the server side is
 * code-hub-shadow-store.ts.
 */

import type { PoolEntry } from "@/lib/forge";
import { buildHub, type BuiltCode } from "@/lib/code-hub";

export const SHADOW_VARIANT = "team-hit-l8-x0.25";
/** A team's published picks counted. */
export const TEAM_WINDOW = 8;
/** Fewer settled picks than this and a team has no record yet. */
export const TEAM_MIN_PICKS = 4;
/** How much a pair's hit rate moves a leg: 0.25 of its distance from the usual rate. */
export const TEAM_WEIGHT = 0.25;
/** The usual hit rate of the published pick, around which teams are measured. */
export const TEAM_BASE_HIT = 0.76;

export interface SettledPick {
  leagueCode: string | null;
  homeName: string;
  awayName: string;
  kickoff: string;
  won: boolean;
}

const key = (league: string | null | undefined, team: string) => `${league ?? ""}|${team.trim().toLowerCase()}`;

/** Each team's hit rate over its last TEAM_WINDOW settled picks, for teams with at least TEAM_MIN_PICKS. */
export function teamRecords(picks: readonly SettledPick[]): Map<string, { n: number; hit: number }> {
  const byTeam = new Map<string, { t: number; won: boolean }[]>();
  for (const p of picks) {
    const t = Date.parse(p.kickoff);
    for (const name of [p.homeName, p.awayName]) {
      const k = key(p.leagueCode, name);
      const xs = byTeam.get(k) ?? [];
      xs.push({ t, won: p.won });
      byTeam.set(k, xs);
    }
  }
  const out = new Map<string, { n: number; hit: number }>();
  for (const [k, xs] of byTeam) {
    const last = xs.sort((a, b) => a.t - b.t).slice(-TEAM_WINDOW);
    if (last.length < TEAM_MIN_PICKS) continue;
    out.set(k, { n: last.length, hit: last.filter((x) => x.won).length / last.length });
  }
  return out;
}

/** The nudge for one game: 0 unless both teams have a record. */
export function teamMark(records: Map<string, { n: number; hit: number }>, league: string | null | undefined, home: string, away: string): number {
  const h = records.get(key(league, home));
  const a = records.get(key(league, away));
  if (!h || !a) return 0;
  return TEAM_WEIGHT * ((h.hit + a.hit) / 2 - TEAM_BASE_HIT);
}

/**
 * The shadow hub from the real hub's pool: chances nudged for choosing, legs
 * handed back at their real chance so the shadow codes are graded and priced
 * like the real ones.
 */
export function buildShadowHub(pool: PoolEntry[], day: string, records: Map<string, { n: number; hit: number }>): BuiltCode[] {
  const real = new Map<string, number>();
  const marked = pool.map((e) => {
    const m = e.prediction.match;
    const adj = teamMark(records, m.league.code, m.home.name, m.away.name);
    return {
      ...e,
      candidates: e.candidates.map((c) => {
        real.set(`${m.id}|${c.market}`, c.probability);
        return { ...c, probability: Math.min(0.99, c.probability + adj) };
      }),
    };
  });
  return buildHub(marked, day).map((code) => ({
    ...code,
    legs: code.legs.map((l) => ({ ...l, probability: real.get(`${l.matchId}|${l.market}`) ?? l.probability })),
  }));
}
