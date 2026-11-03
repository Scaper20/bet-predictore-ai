// Written by scripts/props-lab.ts --ship (walk-forward backtest, see docs/props-backtest.md). Do not edit by hand.
import type { PropMarketKey, PropParams } from "./player-props";

export interface FittedMarket {
  params: PropParams;
  /** Logit scaling for over/under probabilities. */
  calibration: number;
  /** Passed its backtest gate: may be published (still behind the player_props switch). */
  publish: boolean;
}

export const PROP_FIT: Record<PropMarketKey, FittedMarket> = {
  goals: {
    params: { halfLife: 180, k: 5, oppK: 60, blend: 0.8, size: { 0: Infinity, 1: Infinity, 2: Infinity, 3: Infinity } },
    calibration: 1.1,
    publish: true,
  },
  assists: {
    params: { halfLife: 730, k: 5, oppK: 0, blend: 0.8, size: { 0: Infinity, 1: Infinity, 2: 13.95, 3: Infinity } },
    calibration: 1.06,
    publish: true,
  },
  goalsAssists: {
    params: { halfLife: 180, k: 2, oppK: 60, blend: 0.8, size: { 0: Infinity, 1: Infinity, 2: Infinity, 3: Infinity } },
    calibration: 1.08,
    publish: true,
  },
  shots: {
    params: { halfLife: 365, k: 5, oppK: 60, blend: 0, size: { 0: Infinity, 1: 6.55, 2: 19.21, 3: 18.31 } },
    calibration: 1,
    publish: true,
  },
  shotsOnTarget: {
    params: { halfLife: 365, k: 10, oppK: 60, blend: 0, size: { 0: Infinity, 1: 5.12, 2: Infinity, 3: Infinity } },
    calibration: 1.04,
    publish: true,
  },
  tackles: {
    params: { halfLife: 180, k: 5, oppK: 60, blend: 0, size: { 0: Infinity, 1: 7.02, 2: 9.48, 3: 5.1 } },
    calibration: 1,
    publish: true,
  },
  fouls: {
    params: { halfLife: 365, k: 5, oppK: 60, blend: 0, size: { 0: Infinity, 1: 21.56, 2: Infinity, 3: Infinity } },
    calibration: 1,
    publish: true,
  },
  clearances: {
    params: { halfLife: 90, k: 2, oppK: 30, blend: 0, size: { 0: Infinity, 1: 4.5, 2: 3.26, 3: 2.79 } },
    calibration: 0.96,
    publish: true,
  },
  passes: {
    params: { halfLife: 365, k: 2, oppK: 30, blend: 0, size: { 0: Infinity, 1: 10.39, 2: 11.02, 3: 12.22 } },
    calibration: 0.92,
    publish: true,
  },
  saves: {
    params: { halfLife: 365, k: 20, oppK: 10, blend: 0, size: { 0: 13.49, 1: Infinity, 2: Infinity, 3: Infinity } },
    calibration: 1.02,
    publish: true,
  },
};
