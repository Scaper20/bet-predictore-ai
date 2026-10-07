import { scoreMatrix } from "@/lib/model/poisson";

/**
 * Half-time and second-half markets, read off the full-match model.
 *
 * Each side's expected goals are split between the halves by the share of
 * goals its competition scores before the break (about 44%: games open up
 * as legs tire and trailing sides push). Each half is then its own
 * independent Poisson grid. No new ratings are fitted, so these markets
 * inherit the full-match model's strengths and errors rather than adding a
 * second model to trust.
 *
 * Published as Pro market probabilities only, never as headline picks or on
 * the track record: walk-forward over three held-out seasons the half-time
 * result beat the base rates by about 4% (log loss) and every half line was
 * calibrated within about 2.5 points, but no half selection is both likely
 * enough to be a pick and informative beyond the base rate (docs/halves.md).
 */

/** First-half goal share and tilt the site uses; measured across eight leagues (scripts/halves-lab.ts). */
export const SITE_FIRST_HALF_SHARE = 0.443;
export const SITE_HALF_TILT = 0.1;

/** Share of goals scored in the first half when a sample has none to measure. */
export const DEFAULT_FIRST_HALF_SHARE = 0.44;
/** Matches of evidence before a measured share outweighs the default. */
const SHARE_PRIOR_WEIGHT = 300;

export interface HalfShare {
  home: number;
  away: number;
}

/**
 * First-half share of goals for home and away sides, from matches with a
 * recorded half-time score, shrunk toward the default on a thin sample.
 */
export function firstHalfShare(
  rows: { homeGoals: number; awayGoals: number; htHome?: number; htAway?: number }[],
): HalfShare {
  let ftH = 0, ftA = 0, htH = 0, htA = 0, n = 0;
  for (const r of rows) {
    if (r.htHome === undefined || r.htAway === undefined) continue;
    if (r.htHome > r.homeGoals || r.htAway > r.awayGoals) continue;
    ftH += r.homeGoals;
    ftA += r.awayGoals;
    htH += r.htHome;
    htA += r.htAway;
    n++;
  }
  // Goals-weighted prior: SHARE_PRIOR_WEIGHT matches' worth of the default.
  const priorGoals = SHARE_PRIOR_WEIGHT * 1.4;
  const shrink = (ht: number, ft: number) => (ht + DEFAULT_FIRST_HALF_SHARE * priorGoals) / (ft + priorGoals);
  return n === 0
    ? { home: DEFAULT_FIRST_HALF_SHARE, away: DEFAULT_FIRST_HALF_SHARE }
    : { home: shrink(htH, ftH), away: shrink(htA, ftA) };
}

export interface HalfMarkets {
  /** Half-time result. */
  ht: { home: number; draw: number; away: number };
  /** Goals in the first half over the line. */
  htOver: { "0.5": number; "1.5": number };
  /** Goals in the second half over the line. */
  shOver: { "0.5": number; "1.5": number };
  /** Which half has more goals. */
  highestHalf: { first: number; second: number; equal: number };
  /** Both teams score in the first half. */
  bttsFirstHalf: number;
  /** Half-time / full-time, keyed "H/H", "D/A" and so on. */
  htft: Record<string, number>;
}

const RESULT = (x: number, y: number) => (x > y ? "H" : x === y ? "D" : "A");

/**
 * `tilt` moves first-half goals toward the stronger side: each team's share
 * is scaled by (its rate / the opponent's)^tilt. Walk-forward, favourites
 * led at half time more often than an even split predicts (54% → 64%).
 */
/** The two halves' independent score grids, after the share and tilt. */
export function halfGrids(lambda: number, mu: number, share: HalfShare, tilt = 0): { first: number[][]; second: number[][] } {
  const ratio = mu > 0 && lambda > 0 ? lambda / mu : 1;
  const clamp = (x: number) => Math.min(0.75, Math.max(0.2, x));
  const sh = clamp(share.home * ratio ** tilt);
  const sa = clamp(share.away * ratio ** -tilt);
  return { first: scoreMatrix(lambda * sh, mu * sa), second: scoreMatrix(lambda * (1 - sh), mu * (1 - sa)) };
}

export function halfMarkets(lambda: number, mu: number, share: HalfShare, tilt = 0): HalfMarkets {
  const { first, second } = halfGrids(lambda, mu, share, tilt);
  const n = first.length;

  // Per-half total-goal distributions.
  const totals = (g: number[][]) => {
    const t = new Array<number>(2 * n).fill(0);
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) t[x + y] += g[x][y];
    return t;
  };
  const t1 = totals(first);
  const t2 = totals(second);

  let h = 0, d = 0, a = 0, btts = 0;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const p = first[x][y];
      if (x > y) h += p;
      else if (x === y) d += p;
      else a += p;
      if (x > 0 && y > 0) btts += p;
    }
  }

  let firstMore = 0, equal = 0;
  for (let i = 0; i < t1.length; i++) {
    for (let j = 0; j < t2.length; j++) {
      const p = t1[i] * t2[j];
      if (i > j) firstMore += p;
      else if (i === j) equal += p;
    }
  }

  // HT/FT: combine the halves cell by cell (independent halves).
  const htft: Record<string, number> = {};
  for (const k of ["H/H", "H/D", "H/A", "D/H", "D/D", "D/A", "A/H", "A/D", "A/A"]) htft[k] = 0;
  for (let x1 = 0; x1 < n; x1++) {
    for (let y1 = 0; y1 < n; y1++) {
      const p1 = first[x1][y1];
      if (p1 < 1e-9) continue;
      const half = RESULT(x1, y1);
      for (let x2 = 0; x2 < n; x2++) {
        for (let y2 = 0; y2 < n; y2++) {
          const p = p1 * second[x2][y2];
          if (p < 1e-12) continue;
          htft[`${half}/${RESULT(x1 + x2, y1 + y2)}`] += p;
        }
      }
    }
  }

  return {
    ht: { home: h, draw: d, away: a },
    htOver: { "0.5": 1 - t1[0], "1.5": 1 - t1[0] - t1[1] },
    shOver: { "0.5": 1 - t2[0], "1.5": 1 - t2[0] - t2[1] },
    highestHalf: { first: firstMore, second: 1 - firstMore - equal, equal },
    bttsFirstHalf: btts,
    htft,
  };
}
