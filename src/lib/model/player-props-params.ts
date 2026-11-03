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
    params: { halfLife: 365, k: 5, oppK: 30, blend: 0, size: { 0: Infinity, 1: 5.87, 2: 18.74, 3: 17.76 } },
    calibration: 1,
    publish: true,
  },
  shotsOnTarget: {
    params: { halfLife: 730, k: 10, oppK: 60, blend: 0, size: { 0: Infinity, 1: 4.24, 2: Infinity, 3: Infinity } },
    calibration: 1.04,
    publish: true,
  },
  tackles: {
    params: { halfLife: 365, k: 5, oppK: 60, blend: 0, size: { 0: Infinity, 1: 7.3, 2: 9.51, 3: 4.92 } },
    calibration: 1,
    publish: true,
  },
  fouls: {
    params: { halfLife: 365, k: 5, oppK: 60, blend: 0, size: { 0: Infinity, 1: 19.76, 2: Infinity, 3: Infinity } },
    calibration: 1,
    publish: true,
  },
  clearances: {
    params: { halfLife: 180, k: 2, oppK: 30, blend: 0, size: { 0: Infinity, 1: 4.87, 2: 3.55, 3: 3.01 } },
    calibration: 0.98,
    publish: true,
  },
  passes: {
    params: { halfLife: 180, k: 2, oppK: 10, blend: 0, size: { 0: Infinity, 1: 10.63, 2: 11.03, 3: 12.65 } },
    calibration: 0.9,
    publish: true,
  },
  saves: {
    params: { halfLife: 730, k: 20, oppK: 10, blend: 0, size: { 0: 13.75, 1: Infinity, 2: Infinity, 3: Infinity } },
    calibration: 1.02,
    publish: true,
  },
};
