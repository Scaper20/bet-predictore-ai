/**
 * KiqStat's own headline selection.
 *
 * The model prices many families on a game: the result, double chance,
 * goals lines, handicaps, team goals, and (in the 17 divisions with stats)
 * corners, shots and shots on target. Their raw chances aren't comparable:
 * one family's "78%" lands 80% of the time, another's 74%. So each family's
 * chances go through a calibration map fitted on a past season
 * (scripts/headline-lab.ts), and the headline is the candidate with the
 * highest calibrated chance that passes the gates:
 *
 * - a price floor: SportyBet must pay at least ENGINE_MIN_PRICE on it, or,
 *   where the game isn't on its board, our fair odds less its usual margin;
 * - listed: where SportyBet has the game, it must carry the line;
 * - no market dissent: SportyBet rating it ENGINE_MARKET_GAP or more below
 *   the model rules it out;
 * - a family with skill: ones that never beat the market's own read
 *   (draw, home-or-away, both teams to score, correct score, bookings,
 *   halves) are not candidates.
 *
 * A candidate is judged on the lower of its calibrated chance and
 * SportyBet's own, so the headline is a read both sides back.
 *
 * Paused selections (model/paused.ts: goal unders, handicaps of a goal or
 * more) are never candidates while they are paused.
 *
 * Pure: the caller brings the candidates (model chances, and SportyBet's
 * chance and price where it lists the line).
 */

import { isPausedPick } from "./paused";

export interface EngineCandidate {
  market: string;
  /** The model's chance the pick lands. */
  probability: number;
  /** SportyBet's chance, margin stripped; null when it doesn't list the line or its market is incomplete. */
  marketChance: number | null;
  /** SportyBet's price, when it lists the line. */
  price: number | null;
}

export interface EngineChoice extends EngineCandidate {
  family: EngineFamily;
  /** The calibrated chance (calibrationKey). */
  calibrated: number;
  /** What the choice was ranked by: the lower of calibrated and SportyBet's chance. */
  score: number;
  /** A price to show: SportyBet's, else fair odds less its usual margin. */
  loadPrice: number;
}

export type EngineFamily =
  | "result"
  | "double-chance"
  | "goals-over"
  | "goals-under"
  | "handicap"
  | "team-goals"
  | "corners-total"
  | "corners-team"
  | "corners-handicap"
  | "corners-most"
  | "shots-total"
  | "shots-team"
  | "shots-most"
  | "sot-total"
  | "sot-team"
  | "sot-most";

/** The family a market belongs to, or null when it is never a headline. */
export function engineFamily(market: string): EngineFamily | null {
  const [a, b, c, d] = market.split(":");
  const half = (x: string | undefined) => x !== undefined && /\.5$/.test(x);
  if (a === "1x2") return b === "home" || b === "away" ? "result" : null;
  if (a === "dc") return b === "home-draw" || b === "away-draw" ? "double-chance" : null;
  if (a === "ou") {
    if (!half(c) || c === "0.5" || Number(c) > 4) return null;
    return b === "over" ? "goals-over" : "goals-under";
  }
  if (a === "ah") return half(c) && Math.abs(Number(c)) >= 1.5 ? "handicap" : null;
  if (a === "tg") return half(d) ? "team-goals" : null;
  if (a === "corners" || a === "shots" || a === "sot") {
    if (b === "most") return c === "home" || c === "away" ? (`${a}-most` as EngineFamily) : null;
    if (b === "over" || b === "under") return half(c) ? (`${a}-total` as EngineFamily) : null;
    if (b === "home" || b === "away") return half(d) ? (`${a}-team` as EngineFamily) : null;
    if (b === "hcp" && a === "corners") return half(d) ? "corners-handicap" : null;
  }
  return null;
}

/**
 * What a chance is calibrated by: the market without its line for corners
 * and shots ("corners:home:over"), whose lines move game to game, and the
 * market itself for goals ("ah:away:+1.5"). Finer than the family because
 * the biases are: within team corners, "over" landed about 5 points under
 * its stated chance in both seasons tested while "under" was honest.
 */
export function calibrationKey(market: string): string {
  return /^(corners|shots|sot):/.test(market) ? market.replace(/:[+-]?\d+(\.\d+)?$/, "") : market;
}

/** How the families are shown: the "More predictions" rows and the Predictions filter. */
export type EngineGroup = "result" | "goals" | "team-goals" | "corners" | "shots";

export const ENGINE_GROUPS: readonly { id: EngineGroup; label: string }[] = [
  { id: "result", label: "Result" },
  { id: "goals", label: "Goals" },
  { id: "team-goals", label: "Team goals" },
  { id: "corners", label: "Corners" },
  { id: "shots", label: "Shots" },
];

export function groupOf(family: EngineFamily): EngineGroup {
  if (family === "result" || family === "double-chance" || family === "handicap") return "result";
  if (family === "goals-over" || family === "goals-under") return "goals";
  if (family === "team-goals") return "team-goals";
  return family.startsWith("corners") ? "corners" : "shots";
}

export const isEngineGroup = (x: string): x is EngineGroup => ENGINE_GROUPS.some((g) => g.id === x);

/** Calibration knots per calibrationKey, [claimed, landed], increasing; fitted by scripts/headline-lab.ts. */
export type Calibration = Readonly<Record<string, readonly (readonly [number, number])[]>>;

/**
 * Fitted on the tune season (July 2024 to June 2025, 17 divisions) by
 * scripts/headline-lab.ts, every bin shrunk hard toward the stated chance
 * (1,000 pseudo-games) so only a bias seen across thousands of picks moves
 * a chance; see docs/headline-engine.md.
 */
export const ENGINE_CALIBRATION: Calibration = {
  "1x2:away": [[0.581,0.587]],
  "1x2:home": [[0.512,0.513],[0.537,0.548],[0.571,0.584],[0.625,0.64],[0.732,0.747]],
  "ah:away:+1.5": [[0.584,0.575],[0.67,0.66],[0.712,0.71],[0.741,0.746],[0.764,0.77],[0.784,0.793],[0.802,0.811],[0.82,0.825],[0.838,0.85],[0.858,0.864],[0.884,0.891],[0.921,0.93]],
  "ah:home:+1.5": [[0.657,0.652],[0.762,0.76],[0.804,0.799],[0.83,0.831],[0.848,0.855],[0.863,0.867],[0.876,0.883],[0.888,0.89],[0.9,0.906],[0.912,0.923],[0.924,0.929],[0.94,0.941]],
  "corners:away:over": [[0.516,0.508],[0.547,0.533],[0.578,0.579],[0.608,0.617],[0.639,0.632],[0.67,0.665],[0.701,0.685],[0.731,0.734],[0.758,0.756],[0.786,0.777],[0.812,0.819],[0.848,0.833]],
  "corners:away:under": [[0.52,0.527],[0.556,0.56],[0.592,0.595],[0.628,0.635],[0.661,0.666],[0.692,0.702],[0.722,0.735],[0.75,0.757],[0.776,0.777],[0.799,0.806],[0.822,0.829],[0.853,0.862]],
  "corners:hcp:away": [[0.507,0.51],[0.519,0.514],[0.531,0.53],[0.545,0.547],[0.558,0.564],[0.57,0.572],[0.582,0.586],[0.598,0.603]],
  "corners:hcp:home": [[0.506,0.501],[0.518,0.51],[0.53,0.524],[0.548,0.542],[0.565,0.561],[0.577,0.577],[0.588,0.597],[0.612,0.61]],
  "corners:home:over": [[0.514,0.493],[0.544,0.534],[0.572,0.568],[0.601,0.582],[0.631,0.618],[0.659,0.636],[0.689,0.683],[0.715,0.706],[0.742,0.727],[0.769,0.756],[0.794,0.77],[0.826,0.818]],
  "corners:home:under": [[0.517,0.529],[0.551,0.554],[0.584,0.594],[0.617,0.631],[0.648,0.653],[0.676,0.685],[0.705,0.706],[0.731,0.732],[0.757,0.757],[0.779,0.783],[0.802,0.806],[0.83,0.826]],
  "corners:most:home": [[0.523,0.517],[0.567,0.552],[0.612,0.601],[0.668,0.671],[0.776,0.771]],
  "corners:over": [[0.509,0.494],[0.525,0.521],[0.541,0.53],[0.558,0.545],[0.573,0.562],[0.586,0.569],[0.6,0.589],[0.616,0.618]],
  "corners:under": [[0.506,0.509],[0.52,0.532],[0.533,0.545],[0.545,0.546],[0.565,0.569],[0.587,0.598],[0.6,0.608],[0.615,0.625]],
  "dc:away-draw": [[0.512,0.509],[0.534,0.525],[0.552,0.551],[0.57,0.569],[0.589,0.591],[0.606,0.614],[0.626,0.629],[0.648,0.652],[0.672,0.676],[0.703,0.717],[0.748,0.756],[0.826,0.832]],
  "dc:home-draw": [[0.54,0.52],[0.594,0.583],[0.629,0.628],[0.657,0.65],[0.679,0.688],[0.7,0.713],[0.721,0.724],[0.742,0.746],[0.764,0.782],[0.789,0.798],[0.826,0.838],[0.888,0.901]],
  "ou:over:1.5": [[0.639,0.646],[0.676,0.677],[0.696,0.702],[0.713,0.708],[0.728,0.726],[0.743,0.732],[0.758,0.764],[0.774,0.778],[0.791,0.785],[0.809,0.799],[0.83,0.826],[0.865,0.869]],
  "ou:over:2.5": [[0.507,0.52],[0.521,0.525],[0.535,0.531],[0.55,0.554],[0.568,0.557],[0.585,0.577],[0.605,0.607],[0.632,0.64],[0.683,0.687]],
  "ou:under:2.5": [[0.505,0.509],[0.516,0.527],[0.528,0.527],[0.539,0.54],[0.551,0.554],[0.563,0.557],[0.577,0.579],[0.59,0.58],[0.608,0.603],[0.643,0.621]],
  "ou:under:3.5": [[0.563,0.549],[0.617,0.619],[0.648,0.653],[0.673,0.68],[0.694,0.696],[0.714,0.717],[0.73,0.741],[0.746,0.748],[0.762,0.767],[0.779,0.778],[0.796,0.784],[0.825,0.818]],
  "shots:away:over": [[0.513,0.505],[0.537,0.527],[0.561,0.554],[0.584,0.58],[0.608,0.597],[0.635,0.627]],
  "shots:away:under": [[0.513,0.52],[0.536,0.545],[0.561,0.568],[0.585,0.588],[0.61,0.617],[0.636,0.64]],
  "shots:home:over": [[0.512,0.511],[0.534,0.528],[0.554,0.542],[0.576,0.562],[0.6,0.599],[0.624,0.616]],
  "shots:home:under": [[0.511,0.526],[0.535,0.546],[0.557,0.559],[0.579,0.581],[0.601,0.611],[0.626,0.632]],
  "shots:most:home": [[0.561,0.556],[0.682,0.68],[0.832,0.829]],
  "shots:over": [[0.509,0.503],[0.527,0.524],[0.545,0.53],[0.563,0.549],[0.581,0.567],[0.599,0.596],[0.616,0.6],[0.636,0.62]],
  "shots:under": [[0.509,0.526],[0.528,0.535],[0.546,0.548],[0.564,0.566],[0.582,0.595],[0.599,0.606],[0.618,0.617],[0.635,0.637]],
  "sot:away:over": [[0.528,0.516],[0.585,0.58],[0.64,0.644],[0.693,0.685],[0.751,0.735]],
  "sot:away:under": [[0.526,0.532],[0.574,0.573],[0.626,0.638],[0.672,0.671],[0.714,0.714],[0.759,0.765]],
  "sot:home:over": [[0.527,0.513],[0.58,0.568],[0.632,0.626],[0.675,0.667],[0.729,0.726]],
  "sot:home:under": [[0.521,0.527],[0.565,0.563],[0.611,0.619],[0.655,0.661],[0.694,0.694],[0.738,0.735]],
  "sot:most:home": [[0.563,0.568],[0.724,0.734]],
  "sot:over": [[0.516,0.498],[0.547,0.551],[0.58,0.568],[0.614,0.616],[0.645,0.632],[0.679,0.682]],
  "sot:under": [[0.516,0.518],[0.551,0.556],[0.585,0.585],[0.614,0.617],[0.645,0.655],[0.677,0.676]],
  "tg:away:over:0.5": [[0.545,0.551],[0.595,0.595],[0.623,0.617],[0.644,0.65],[0.663,0.678],[0.681,0.679],[0.699,0.692],[0.717,0.718],[0.738,0.734],[0.764,0.773],[0.798,0.8],[0.855,0.859]],
  "tg:away:over:1.5": [[0.572,0.585]],
  "tg:away:under:1.5": [[0.529,0.535],[0.577,0.575],[0.611,0.618],[0.636,0.638],[0.658,0.66],[0.677,0.679],[0.696,0.688],[0.715,0.705],[0.734,0.733],[0.755,0.769],[0.783,0.78],[0.833,0.833]],
  "tg:away:under:2.5": [[0.687,0.678],[0.779,0.784],[0.819,0.822],[0.844,0.846],[0.861,0.866],[0.876,0.875],[0.887,0.893],[0.898,0.899],[0.909,0.913],[0.919,0.925],[0.929,0.939],[0.942,0.94]],
  "tg:home:over:0.5": [[0.607,0.593],[0.668,0.658],[0.699,0.702],[0.72,0.729],[0.738,0.738],[0.754,0.76],[0.77,0.767],[0.786,0.792],[0.805,0.816],[0.827,0.832],[0.852,0.863],[0.899,0.908]],
  "tg:home:over:1.5": [[0.512,0.516],[0.537,0.547],[0.568,0.573],[0.615,0.617],[0.712,0.725]],
  "tg:home:under:1.5": [[0.512,0.512],[0.535,0.533],[0.555,0.556],[0.573,0.58],[0.589,0.585],[0.605,0.611],[0.622,0.63],[0.64,0.644],[0.66,0.657],[0.684,0.686],[0.716,0.725],[0.772,0.776]],
  "tg:home:under:2.5": [[0.61,0.601],[0.704,0.696],[0.745,0.747],[0.775,0.775],[0.798,0.806],[0.817,0.82],[0.833,0.835],[0.847,0.855],[0.862,0.864],[0.878,0.88],[0.898,0.902],[0.926,0.934]],
};

/** A calibrated chance: linear between knots, parallel to stated past the ends; unchanged without a map. */
export function calibrate(market: string, p: number, table: Calibration = ENGINE_CALIBRATION): number {
  const knots = table[calibrationKey(market)];
  if (!knots?.length) return p;
  if (p <= knots[0][0]) return knots[0][1] + (p - knots[0][0]);
  const last = knots[knots.length - 1];
  if (p >= last[0]) return last[1] + (p - last[0]);
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i];
    if (p <= x1) {
      const [x0, y0] = knots[i - 1];
      return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return p;
}

/** SportyBet's usual margin: about 6% on goals markets, 7% on stats (board, October 2026). */
export const marginFor = (market: string) => (/^(corners|shots|sot):/.test(market) ? 1.07 : 1.06);

/** The shortest price a headline is published at. */
export const ENGINE_MIN_PRICE = 1.2;
/** SportyBet this far below the model rules a candidate out (market-check.ts uses 3 points too). */
export const ENGINE_MARKET_GAP = 0.03;
/** Never a headline below this calibrated chance. */
export const ENGINE_FLOOR = 0.6;

export interface EngineOptions {
  calibration?: Calibration;
  /** Whether SportyBet's board for the game was read: then only listed lines may be chosen. */
  onBoard: boolean;
  minPrice?: number;
  floor?: number;
  /** Families to leave out (a paused family, or one only offered elsewhere). */
  exclude?: readonly EngineFamily[];
}

/** Every candidate that passes the gates, ranked best first. */
export function rankCandidates(cands: readonly EngineCandidate[], opts: EngineOptions): EngineChoice[] {
  const minPrice = opts.minPrice ?? ENGINE_MIN_PRICE;
  const floor = opts.floor ?? ENGINE_FLOOR;
  const out: EngineChoice[] = [];
  for (const c of cands) {
    const family = engineFamily(c.market);
    if (!family || opts.exclude?.includes(family) || isPausedPick(c.market)) continue;
    if (opts.onBoard && c.price === null) continue;
    if (c.marketChance !== null && c.probability - c.marketChance >= ENGINE_MARKET_GAP - 1e-9) continue;
    const calibrated = calibrate(c.market, c.probability, opts.calibration);
    const score = Math.min(calibrated, c.marketChance ?? calibrated);
    const loadPrice = c.price ?? 1 / (Math.min(c.probability, c.marketChance ?? 1) * marginFor(c.market));
    if (loadPrice < minPrice - 1e-9 || score < floor) continue;
    out.push({ ...c, family, calibrated, score, loadPrice });
  }
  return out.sort((a, b) => b.score - a.score || b.probability - a.probability);
}

/** One engine read as stored on a prediction, labelled for display. */
export interface EnginePick extends EngineChoice {
  label: string;
  group: EngineGroup;
}

/** The engine's view of a game: its headline and the best pick in each group. */
export interface EngineRead {
  headline: EnginePick | null;
  groups: EnginePick[];
}

/** The headline: the best-ranked candidate, or null when none passes. */
export function chooseHeadline(cands: readonly EngineCandidate[], opts: EngineOptions): EngineChoice | null {
  return rankCandidates(cands, opts)[0] ?? null;
}

/** The best candidate in each group, best first: "More predictions" on a game. */
export function groupPicks(cands: readonly EngineCandidate[], opts: EngineOptions): EngineChoice[] {
  const seen = new Set<EngineGroup>();
  return rankCandidates(cands, opts).filter((c) => {
    const g = groupOf(c.family);
    return seen.has(g) ? false : (seen.add(g), true);
  });
}
