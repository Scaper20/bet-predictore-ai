/**
 * Which parameter set a fixture is predicted with.
 *
 * Model changes must not move picks people have already seen. Every fixture
 * kicking off before NEXT_MODEL_FROM (midnight Lagos, the start of 5 Nov 2026)
 * keeps the parameters it was published under, byte for byte; the changes
 * below apply to games from that moment on. The gate is on KICKOFF, not on
 * when a prediction is computed, because the pages and the log cron rebuild
 * predictions on every run: a gate on "now" would rewrite today's picks the
 * next time they were rebuilt.
 *
 * A second set, goals-v3, starts at MARKET_MODEL_FROM and also fits the ratings
 * partly to the goals the closing prices implied for past games. It applies
 * only where a league's recent training rows carry those goals; everywhere
 * else the 2026-11 set stands. Section L of the audit has the evidence.
 *
 * What the 2026-11 set changes, and the evidence for each (docs/model-audit-teams-2026-11.md):
 *   headlineFloor 0.65      ranker picks stated 60-65% land ~61% (3 samples); +0.5 to +0.9 points of hit rate
 *   overTilt 0.02           owner's preference for overs; neutral on replay (+0.16 and 0.00 points), more overs
 *   headlineHold            CAF Champions League: 9 of 23 landed live against 64% stated, thin pooled history
 *   neutralTotals           tournament totals no longer pulled toward a mean that includes home advantage
 *   newcomerPrior 0 (pools) the promoted-club prior was only ever tested on domestic leagues
 */

import type { FitOptions } from "./fit";
import type { ModelOptions } from "./predict";

/** 2026-11-05 00:00 in Lagos (UTC+1, no daylight saving). */
export const NEXT_MODEL_FROM = Date.parse("2026-11-05T00:00:00+01:00");

/** 2026-11-14 00:00 in Lagos: the first games the market-informed fit may apply to. */
export const MARKET_MODEL_FROM = Date.parse("2026-11-14T00:00:00+01:00");

/** Share of a league's last-year training rows that must carry market goals for goals-v3 to apply. */
export const MARKET_COVERAGE_MIN = 0.4;

export interface ParamSet {
  /** Stable id, part of the shared-fit cache key. */
  id: "goals-v2" | "goals-v2.1" | "goals-v3";
  fit: FitOptions;
  options: Pick<ModelOptions, "overTilt" | "neutralTotals" | "headlineFloor" | "headlineHold" | "strengthStretch">;
}

/** Exactly what ran before the audit: no options, default fit. */
export const LEGACY_PARAMS: ParamSet = { id: "goals-v2", fit: {}, options: {} };

export const NEXT_PARAMS: ParamSet = {
  id: "goals-v2.1",
  fit: {},
  options: {
    overTilt: 0.02,
    neutralTotals: true,
    headlineFloor: 0.65,
    headlineHold: ["caf-champions-league"],
  },
};

/**
 * The 2026-11 set plus the market-informed fit (section L): 60% of each past
 * game's scoring signal from the goals its closing prices implied, 20% from
 * shots on target, 20% from the score; a 120-day half-life, light shrinkage
 * and a 10% stretch of the strength gap. Walk-forward over 17 divisions this
 * took 1X2 log loss 0.0084 (2022-25), 0.0068 (2025-26) and 0.0131 (Sep-Oct
 * 2026) below the shipped fit, each outside its 95% interval.
 */
export const MARKET_PARAMS: ParamSet = {
  id: "goals-v3",
  fit: { shotWeight: 0.2, mktWeight: 0.6, halfLifeDays: 120, regularisation: 0.005 },
  // overTilt 0.04 rather than 0.02: the sweet-spot rules were tuned to the old probabilities, and with
  // the sharper ones the share of overs among the headlines fell from 29% to 25%; 0.04 restores it to
  // today's level with the same hit rate (section L). 0.08 gives ~40% overs, also with no measured cost.
  options: { ...NEXT_PARAMS.options, overTilt: 0.04, strengthStretch: 1.1 },
};

/**
 * Share of the rows in the year before `kickoff` that carry the goals their
 * closing prices implied (ResultRow.homeMkt / awayMkt).
 */
export function marketCoverage(rows: readonly { date: number; homeMkt?: number; awayMkt?: number }[], kickoff: string | number): number {
  const at = typeof kickoff === "number" ? kickoff : Date.parse(kickoff);
  if (!Number.isFinite(at)) return 0;
  const from = at - 365 * 86_400_000;
  let seen = 0;
  let priced = 0;
  for (const r of rows) {
    if (r.date < from || r.date >= at) continue;
    seen++;
    if (r.homeMkt !== undefined && r.awayMkt !== undefined) priced++;
  }
  return seen >= 100 ? priced / seen : 0;
}

/**
 * @param kickoff   the fixture's kickoff (ISO string or epoch ms)
 * @param pooled    true for national-team and cup pools, where a club "first seen late" is not a promoted side
 * @param coverage  marketCoverage() of the fixture's training rows; goals-v3 needs MARKET_COVERAGE_MIN
 */
export function paramsFor(kickoff: string | number, pooled = false, coverage = 0): ParamSet {
  const at = typeof kickoff === "number" ? kickoff : Date.parse(kickoff);
  if (!Number.isFinite(at) || at < NEXT_MODEL_FROM) return LEGACY_PARAMS;
  if (pooled) return { ...NEXT_PARAMS, fit: { ...NEXT_PARAMS.fit, newcomerPrior: 0 } };
  if (at >= MARKET_MODEL_FROM && coverage >= MARKET_COVERAGE_MIN) return MARKET_PARAMS;
  return NEXT_PARAMS;
}
