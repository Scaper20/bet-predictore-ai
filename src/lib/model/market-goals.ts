/**
 * The goals a bookmaker's prices imply for a game.
 *
 * Closing 1X2 and over/under 2.5 prices carry what the whole market knew at
 * kickoff, lineups and injuries included. De-vigged, they pin down how many
 * goals each side was expected to score. Fitting the ratings partly to those
 * expected goals instead of only to the (very noisy) final score is the
 * largest walk-forward gain found in the Nov 2026 search: 1X2 log loss
 * -0.007 to -0.014 on three separate windows, every one outside its interval
 * (docs/model-audit-teams-2026-11.md, section L). A match is one score drawn
 * from a distribution; the price is an estimate of the distribution itself.
 *
 * Pure maths, shared by the nightly fill (archive/market-goals.ts), the lab
 * (scripts/lib/improve-core.ts) and the tests, so all three solve the same way.
 */
import { scoreMatrix } from "./poisson";

/** Dixon-Coles low-score parameter used when solving, the model's typical fitted value. */
export const IMPLIED_RHO = -0.07;
/** Where the solver starts for a league-average game. */
const START: [number, number] = [1.45, 1.15];

interface Summary {
  home: number;
  away: number;
  over25: number;
}

function summarise(lambda: number, mu: number, rho: number): Summary {
  const g = scoreMatrix(lambda, mu, rho);
  let home = 0;
  let away = 0;
  let over25 = 0;
  for (let x = 0; x < g.length; x++)
    for (let y = 0; y < g[x].length; y++) {
      const p = g[x][y];
      if (x > y) home += p;
      else if (x < y) away += p;
      if (x + y > 2) over25 += p;
    }
  return { home, away, over25 };
}

/**
 * The goal rates whose grid reproduces a market's home-minus-away edge and its
 * over 2.5, with the model's own low-score parameter. The total is found from
 * the over 2.5, the split from the gap between home and away win, alternating
 * a few times (each mostly governs one quantity, so it settles fast).
 */
export function impliedRates(
  pHome: number,
  pAway: number,
  pOver25: number,
  rho: number,
  start: [number, number] = START,
): [number, number] {
  let total = start[0] + start[1];
  let ratio = start[0] / start[1];
  const rates = (t: number, r: number): [number, number] => [(t * r) / (1 + r), t / (1 + r)];
  for (let it = 0; it < 4; it++) {
    let lo = 0.8;
    let hi = 7;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const [l, m] = rates(mid, ratio);
      if (summarise(l, m, rho).over25 < pOver25) lo = mid;
      else hi = mid;
    }
    total = (lo + hi) / 2;
    const target = pHome - pAway;
    lo = Math.log(0.12);
    hi = Math.log(9);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const [l, m] = rates(total, Math.exp(mid));
      const q = summarise(l, m, rho);
      if (q.home - q.away < target) lo = mid;
      else hi = mid;
    }
    ratio = Math.exp((lo + hi) / 2);
  }
  return rates(total, ratio);
}

const valid = (...prices: number[]) => prices.every((p) => Number.isFinite(p) && p > 1.01 && p < 200);

/**
 * Expected goals [home, away] from a bookmaker's 1X2 and over/under 2.5 prices
 * (decimal), margin removed proportionally. Null for prices that cannot be real.
 */
export function marketGoals(
  oneXTwo: { home: number; draw: number; away: number },
  overUnder: { over: number; under: number },
): [number, number] | null {
  if (!valid(oneXTwo.home, oneXTwo.draw, oneXTwo.away, overUnder.over, overUnder.under)) return null;
  const sum3 = 1 / oneXTwo.home + 1 / oneXTwo.draw + 1 / oneXTwo.away;
  const sum2 = 1 / overUnder.over + 1 / overUnder.under;
  const [h, a] = impliedRates(
    1 / oneXTwo.home / sum3,
    1 / oneXTwo.away / sum3,
    1 / overUnder.over / sum2,
    IMPLIED_RHO,
  );
  return Number.isFinite(h) && Number.isFinite(a) ? [h, a] : null;
}
