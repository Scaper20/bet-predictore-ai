import "server-only";

import type { Match } from "@/lib/types";
import { cached } from "@/lib/providers/cache";
import { archivedStatRows, type StatRow } from "@/lib/archive/history-store";
import { refereeFor } from "@/lib/archive/referees";
import { leagueByCode } from "@/lib/leagues";
import { looseKey, nameBook, nameScope } from "@/lib/teams/canonical";
import {
  expectStat, fitStat, statGrid, statMarkets, statSelections, STAT_LINES, STAT_OPTIONS,
  type StatFit, type StatKind, type StatMarkets, type StatSample,
} from "@/lib/model/match-stats";
import { goalMarkets, type GoalMarkets } from "@/lib/model/goal-markets";
import { scoreMatrix } from "@/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "@/lib/model/halves";
import type { Prediction } from "@/lib/model/predict";
import type { StatFamily } from "@/lib/leg-pricing";

/**
 * Corners, cards, shots and shots on target for a fixture, plus the extra
 * goal markets (docs/stats-markets.md). Shown on the match page's Markets
 * tab as probabilities, never picks; the admin endpoint
 * (api/admin/stat-markets) returns the raw numbers for checking.
 */

export interface FixtureStatMarkets {
  referee: string | null;
  /** Null for a statistic this competition has no history for. */
  stats: Partial<Record<StatKind, StatMarkets & { matches: number }>>;
  goals: GoalMarkets;
}

/** Fitted per competition; bookings only where the archive stores red cards apart (0072). */
const FIT_KINDS: StatKind[] = ["corners", "cards", "bookings", "shots", "shotsOnTarget"];
/** Shown on the match page's Markets tab. */
const KINDS: StatKind[] = ["corners", "cards", "shots", "shotsOnTarget"];
/** Fewer matches of a statistic than this and it is not modelled. */
const MIN_MATCHES = 200;

function samples(rows: StatRow[], kind: StatKind, canon: (n: string) => string): StatSample[] {
  const out: StatSample[] = [];
  for (const r of rows) {
    const v = r[kind];
    if (!v) continue;
    out.push({ date: r.date, home: canon(r.homeName), away: canon(r.awayName), h: v[0], a: v[1], referee: r.referee });
  }
  return out;
}

/** One fit per competition, statistic and day. */
async function leagueFits(code: string): Promise<{ fits: Partial<Record<StatKind, StatFit>>; canon: (n: string) => string }> {
  const def = leagueByCode(code);
  const scope = def ? nameScope(def) : null;
  const book = scope ? await nameBook(scope) : null;
  const canon = (n: string) => book?.canonical.get(looseKey(n)) ?? n;
  const day = new Date().toISOString().slice(0, 10);
  const fits = await cached(`stat-fits:${code}:${day}`, 6 * 3_600_000, async () => {
    const rows = await archivedStatRows(code);
    const now = Date.now();
    const out: Partial<Record<StatKind, StatFit>> = {};
    for (const kind of FIT_KINDS) {
      const s = samples(rows, kind, canon);
      if (s.length >= MIN_MATCHES) out[kind] = fitStat(s, now, STAT_OPTIONS[kind]);
    }
    return out;
  });
  return { fits, canon };
}

export async function fixtureStatMarkets(match: Match, prediction: Prediction): Promise<FixtureStatMarkets> {
  const { home: lam, away: mu } = prediction.markets.expectedGoals;
  const goals = goalMarkets(
    scoreMatrix(lam, mu, prediction.model.rho),
    halfGrids(lam, mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT, SITE_SECOND_HALF_TILT),
  );
  const code = match.league.code;
  if (!code) return { referee: null, stats: {}, goals };

  const [{ fits, canon }, referee] = await Promise.all([leagueFits(code), refereeFor(match).catch(() => null)]);
  const stats: FixtureStatMarkets["stats"] = {};
  for (const kind of KINDS) {
    const fit = fits[kind];
    if (!fit) continue;
    const expected = expectStat(fit, canon(match.home.name), canon(match.away.name), kind === "cards" ? referee ?? undefined : undefined);
    stats[kind] = { ...statMarkets(statGrid(expected, fit, STAT_LINES[kind].max), STAT_LINES[kind]), matches: fit.matches };
  }
  return { referee, stats, goals };
}

const PICK_KINDS: StatKind[] = ["corners", "shots", "shotsOnTarget"];

/**
 * The chances a sweet spot (model/sweet-spots.ts) reads for corners, shots
 * and shots on target, keyed like a pick's market. Undefined for a
 * competition with no stat history, or when the archive cannot be read.
 */
export async function statChances(match: Match): Promise<Record<string, number> | undefined> {
  const code = match.league.code;
  if (!code) return undefined;
  try {
    const { fits, canon } = await leagueFits(code);
    const out: Record<string, number> = {};
    for (const kind of PICK_KINDS) {
      const fit = fits[kind];
      if (!fit) continue;
      const expected = expectStat(fit, canon(match.home.name), canon(match.away.name));
      Object.assign(out, statSelections(kind, statMarkets(statGrid(expected, fit, STAT_LINES[kind].max), STAT_LINES[kind])));
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Our count families, keyed the way their markets are ("sot:over:9.5"). */
const GRID_KINDS: Record<StatFamily, StatKind> = { corners: "corners", shots: "shots", sot: "shotsOnTarget", bookings: "bookings" };

/**
 * The fixture's joint count grids for corners, shots, shots on target and
 * bookings, for pricing any line SportyBet lists (leg-pricing.ts). A family
 * is missing where the competition has too little history for it, or when
 * the caller leaves it out of `families`.
 */
export async function statGridsFor(
  match: Match,
  families: readonly StatFamily[] = Object.keys(GRID_KINDS) as StatFamily[],
): Promise<Partial<Record<StatFamily, number[][]>>> {
  const code = match.league.code;
  if (!code) return {};
  try {
    // The referee only moves bookings; skip the lookup when they aren't asked for.
    const [{ fits, canon }, referee] = await Promise.all([
      leagueFits(code),
      families.includes("bookings") ? refereeFor(match).catch(() => null) : null,
    ]);
    const out: Partial<Record<StatFamily, number[][]>> = {};
    for (const [family, kind] of Object.entries(GRID_KINDS) as [StatFamily, StatKind][]) {
      if (!families.includes(family)) continue;
      const fit = fits[kind];
      if (!fit) continue;
      const withReferee = kind === "bookings" ? referee ?? undefined : undefined;
      out[family] = statGrid(expectStat(fit, canon(match.home.name), canon(match.away.name), withReferee), fit, STAT_LINES[kind].max);
    }
    return out;
  } catch {
    return {};
  }
}

/** Per game, for and against, over a club's recent games in this competition. */
export interface TeamStatAverage {
  games: number;
  corners: [number, number] | null;
  shots: [number, number] | null;
  shotsOnTarget: [number, number] | null;
}

const AVG_GAMES = 10;

/**
 * Both clubs' corners, shots and shots on target per game, for and against,
 * from their last ten games in this competition that carry the statistics
 * (the archive the corners and shots model is fitted on). Null for a club
 * with no such games, or a competition with no stats.
 */
export async function teamStatAverages(match: Match): Promise<{ home: TeamStatAverage | null; away: TeamStatAverage | null }> {
  const none = { home: null, away: null };
  const code = match.league.code;
  if (!code) return none;
  const def = leagueByCode(code);
  const scope = def ? nameScope(def) : null;
  const book = scope ? await nameBook(scope) : null;
  const key = (n: string) => looseKey(book?.canonical.get(looseKey(n)) ?? n);
  const rows = await archivedStatRows(code);
  if (rows.length === 0) return none;

  const forTeam = (name: string): TeamStatAverage | null => {
    const k = key(name);
    const games = rows.filter((r) => key(r.homeName) === k || key(r.awayName) === k).slice(0, AVG_GAMES);
    if (games.length === 0) return null;
    const avg = (kind: "corners" | "shots" | "shotsOnTarget"): [number, number] | null => {
      const xs = games.filter((g) => g[kind]);
      if (xs.length === 0) return null;
      let f = 0;
      let a = 0;
      for (const g of xs) {
        const home = key(g.homeName) === k;
        f += g[kind]![home ? 0 : 1];
        a += g[kind]![home ? 1 : 0];
      }
      return [f / xs.length, a / xs.length];
    };
    return { games: games.length, corners: avg("corners"), shots: avg("shots"), shotsOnTarget: avg("shotsOnTarget") };
  };
  return { home: forTeam(match.home.name), away: forTeam(match.away.name) };
}
