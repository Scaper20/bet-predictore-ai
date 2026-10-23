/**
 * How the model stands against SportyBet's prices on settled picks, for
 * /admin/model-performance. Pure.
 *
 * - Closing line value: did the price we published at beat the price at
 *   kick-off? Beating the close on average is the earliest sign of a real
 *   edge, long before win rates settle.
 * - Brier score and log loss of three forecasts on the same picks: the
 *   model, SportyBet's de-vigged probability at publish, and a half-and-half
 *   blend. Lower is better. If the blend beats the model, the prices carry
 *   information the model lacks.
 */
import { closingLineValue } from "./market-prob";

export interface PricedOutcome {
  probability: number;
  marketProbability: number | null;
  priceAtPublish: number | null;
  closingPrice: number | null;
  result: "win" | "lose" | "push" | null;
}

export interface Score {
  brier: number;
  logLoss: number;
}

export interface PriceSkill {
  clv: { n: number; beatClose: number; average: number } | null;
  /** On picks with a market probability and a win or loss. */
  forecasts: { n: number; model: Score; market: Score; blend: Score } | null;
}

const EPS = 1e-6;

function score(pairs: readonly [number, number][]): Score {
  let brier = 0;
  let logLoss = 0;
  for (const [p, y] of pairs) {
    const q = Math.min(1 - EPS, Math.max(EPS, p));
    brier += (q - y) ** 2;
    logLoss -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
  }
  const n = pairs.length;
  return { brier: Math.round((brier / n) * 10_000) / 10_000, logLoss: Math.round((logLoss / n) * 10_000) / 10_000 };
}

export function priceSkill(rows: readonly PricedOutcome[]): PriceSkill {
  const clvRows = rows.filter((r) => r.priceAtPublish && r.closingPrice);
  const clvs = clvRows.map((r) => closingLineValue(r.priceAtPublish!, r.closingPrice!));
  const decided = rows.filter((r) => r.marketProbability !== null && (r.result === "win" || r.result === "lose"));
  const y = (r: PricedOutcome) => (r.result === "win" ? 1 : 0);
  return {
    clv: clvs.length
      ? {
          n: clvs.length,
          beatClose: Math.round((clvs.filter((c) => c > 0).length / clvs.length) * 1000) / 1000,
          average: Math.round((clvs.reduce((s, c) => s + c, 0) / clvs.length) * 10_000) / 10_000,
        }
      : null,
    forecasts: decided.length
      ? {
          n: decided.length,
          model: score(decided.map((r) => [r.probability, y(r)])),
          market: score(decided.map((r) => [r.marketProbability!, y(r)])),
          blend: score(decided.map((r) => [(r.probability + r.marketProbability!) / 2, y(r)])),
        }
      : null,
  };
}

/** Log loss of paired forecasts on the same outcomes: [first, second], for shadow comparisons. */
export function pairedLogLoss(rows: readonly { a: number; b: number; won: boolean }[]): { n: number; a: number; b: number } | null {
  if (rows.length === 0) return null;
  return {
    n: rows.length,
    a: score(rows.map((r) => [r.a, r.won ? 1 : 0])).logLoss,
    b: score(rows.map((r) => [r.b, r.won ? 1 : 0])).logLoss,
  };
}
