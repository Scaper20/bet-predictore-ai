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

export interface ParamSet {
  /** Stable id, part of the shared-fit cache key. */
  id: "goals-v2" | "goals-v2.1";
  fit: FitOptions;
  options: Pick<ModelOptions, "overTilt" | "neutralTotals" | "headlineFloor" | "headlineHold">;
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
 * @param kickoff   the fixture's kickoff (ISO string or epoch ms)
 * @param pooled    true for national-team and cup pools, where a club "first seen late" is not a promoted side
 */
export function paramsFor(kickoff: string | number, pooled = false): ParamSet {
  const at = typeof kickoff === "number" ? kickoff : Date.parse(kickoff);
  if (!Number.isFinite(at) || at < NEXT_MODEL_FROM) return LEGACY_PARAMS;
  return pooled ? { ...NEXT_PARAMS, fit: { ...NEXT_PARAMS.fit, newcomerPrior: 0 } } : NEXT_PARAMS;
}
