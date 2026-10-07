import "server-only";

import type { Match } from "@/lib/types";
import { cached } from "@/lib/providers/cache";
import { archivedStatRows, type StatRow } from "@/lib/archive/history-store";
import { refereeFor } from "@/lib/archive/referees";
import { leagueByCode } from "@/lib/leagues";
import { looseKey, nameBook, nameScope } from "@/lib/teams/canonical";
import {
  expectStat, fitStat, statGrid, statMarkets, STAT_LINES, STAT_OPTIONS,
  type StatFit, type StatKind, type StatMarkets, type StatSample,
} from "@/lib/model/match-stats";
import { goalMarkets, type GoalMarkets } from "@/lib/model/goal-markets";
import { scoreMatrix } from "@/lib/model/poisson";
import { halfGrids, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT } from "@/lib/model/halves";
import type { Prediction } from "@/lib/model/predict";

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
    for (const kind of KINDS) {
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
    halfGrids(lam, mu, { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE }, SITE_HALF_TILT),
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
