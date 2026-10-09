/**
 * More goal markets, read off the same score grids the site already fits.
 *
 * Nothing new is estimated here. The full-match grid (poisson.ts
 * scoreMatrix, with the fitted low-score correction) answers every
 * full-time question below, and the two half grids (halves.ts halfGrids)
 * answer the half-by-half ones, combined cell by cell on the assumption
 * that the halves are independent once the expected goals are known. So
 * these markets are exactly as good as the goals model and the half split,
 * no better: scripts/stats-lab.ts --goals scores each one walk-forward.
 */

export interface ThreeWay {
  home: number;
  draw: number;
  away: number;
}

export interface GoalMarkets {
  /** Both teams score two or more. */
  gg2: number;
  /** Team totals over 0.5, 1.5, 2.5. */
  homeOver: Record<string, number>;
  awayOver: Record<string, number>;
  winToNil: { home: number; away: number };
  /** Total goals inside an inclusive range, keyed "1-3". */
  multiGoal: Record<string, number>;
  /** Exact total goals 0..5, then "6+". */
  exactTotal: Record<string, number>;
  odd: number;
  /** Three-way (European) handicap on the home side, keyed "-1". */
  euroHandicap: Record<string, ThreeWay>;
  /** Result and both teams to score, and result and over 2.5. */
  resultBtts: { homeYes: number; drawYes: number; awayYes: number; homeNo: number; awayNo: number };
  resultOver25: { homeOver: number; awayOver: number; drawOver: number; homeUnder: number; awayUnder: number };
  /** Second-half-only result. */
  secondHalf: ThreeWay;
  /** First-half Asian handicap on the home side; whole lines can push. */
  firstHalfHandicap: Record<string, { home: number; away: number; push: number }>;
  winEitherHalf: { home: number; away: number };
  winBothHalves: { home: number; away: number };
  scoreBothHalves: { home: number; away: number };
  /** A goal in each half / under 1.5 in each half. */
  bothHalvesOver05: number;
  bothHalvesUnder15: number;
  bttsSecondHalf: number;
  /** Team to score in the first / second half. */
  homeScores: { first: number; second: number };
  awayScores: { first: number; second: number };
}

export const MULTI_GOAL_RANGES: [number, number][] = [[1, 2], [1, 3], [2, 3], [2, 4], [3, 4], [3, 5], [4, 6]];
export const EURO_HANDICAP_LINES = [-2, -1, 1, 2];
export const FIRST_HALF_AH_LINES = [-1.5, -1, -0.5, 0, 0.5];

const key = (x: number) => (x > 0 ? `+${x}` : String(x));

export function goalMarkets(full: number[][], halves: { first: number[][]; second: number[][] }): GoalMarkets {
  const n = full.length;
  let gg2 = 0, odd = 0, nilH = 0, nilA = 0;
  const homeOver = { "0.5": 0, "1.5": 0, "2.5": 0 } as Record<string, number>;
  const awayOver = { "0.5": 0, "1.5": 0, "2.5": 0 } as Record<string, number>;
  const multiGoal = Object.fromEntries(MULTI_GOAL_RANGES.map(([a, b]) => [`${a}-${b}`, 0])) as Record<string, number>;
  const exactTotal: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 };
  const euroHandicap = Object.fromEntries(EURO_HANDICAP_LINES.map((l) => [key(l), { home: 0, draw: 0, away: 0 }])) as Record<string, ThreeWay>;
  const rb = { homeYes: 0, drawYes: 0, awayYes: 0, homeNo: 0, awayNo: 0 };
  const ro = { homeOver: 0, awayOver: 0, drawOver: 0, homeUnder: 0, awayUnder: 0 };

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const p = full[x][y];
      if (p === 0) continue;
      const t = x + y;
      if (x >= 2 && y >= 2) gg2 += p;
      if (t % 2 === 1) odd += p;
      for (const l of [0.5, 1.5, 2.5]) {
        if (x > l) homeOver[String(l)] += p;
        if (y > l) awayOver[String(l)] += p;
      }
      if (x > y && y === 0) nilH += p;
      if (y > x && x === 0) nilA += p;
      for (const [a, b] of MULTI_GOAL_RANGES) if (t >= a && t <= b) multiGoal[`${a}-${b}`] += p;
      exactTotal[t >= 6 ? "6+" : String(t)] += p;
      for (const l of EURO_HANDICAP_LINES) {
        const d = x + l - y;
        const e = euroHandicap[key(l)];
        if (d > 0) e.home += p;
        else if (d === 0) e.draw += p;
        else e.away += p;
      }
      const btts = x > 0 && y > 0;
      if (x > y) {
        if (btts) rb.homeYes += p;
        else rb.homeNo += p;
      } else if (x < y) {
        if (btts) rb.awayYes += p;
        else rb.awayNo += p;
      } else if (btts) rb.drawYes += p;
      const over = t > 2.5;
      if (x > y) {
        if (over) ro.homeOver += p;
        else ro.homeUnder += p;
      } else if (x < y) {
        if (over) ro.awayOver += p;
        else ro.awayUnder += p;
      } else if (over) ro.drawOver += p;
    }
  }

  // Half-by-half: summarise each half once, then combine.
  const summarise = (g: number[][]) => {
    let h = 0, d = 0, a = 0, hs = 0, as = 0, any = 0, u15 = 0, btts = 0;
    const diff = new Map<number, number>();
    for (let x = 0; x < g.length; x++) {
      for (let y = 0; y < g.length; y++) {
        const p = g[x][y];
        if (x > y) h += p;
        else if (x === y) d += p;
        else a += p;
        if (x > 0) hs += p;
        if (y > 0) as += p;
        if (x + y > 0) any += p;
        if (x + y < 2) u15 += p;
        if (x > 0 && y > 0) btts += p;
        diff.set(x - y, (diff.get(x - y) ?? 0) + p);
      }
    }
    return { h, d, a, hs, as, any, u15, btts, diff };
  };
  const f = summarise(halves.first);
  const s = summarise(halves.second);

  const firstHalfHandicap: GoalMarkets["firstHalfHandicap"] = {};
  for (const l of FIRST_HALF_AH_LINES) {
    let home = 0, away = 0, push = 0;
    for (const [d, p] of f.diff) {
      const m = d + l;
      if (m > 0) home += p;
      else if (m < 0) away += p;
      else push += p;
    }
    firstHalfHandicap[l > 0 ? `+${l}` : String(l)] = { home, away, push };
  }

  return {
    gg2,
    homeOver,
    awayOver,
    winToNil: { home: nilH, away: nilA },
    multiGoal,
    exactTotal,
    odd,
    euroHandicap,
    resultBtts: rb,
    resultOver25: ro,
    secondHalf: { home: s.h, draw: s.d, away: s.a },
    firstHalfHandicap,
    winEitherHalf: { home: 1 - (1 - f.h) * (1 - s.h), away: 1 - (1 - f.a) * (1 - s.a) },
    winBothHalves: { home: f.h * s.h, away: f.a * s.a },
    scoreBothHalves: { home: f.hs * s.hs, away: f.as * s.as },
    bothHalvesOver05: f.any * s.any,
    bothHalvesUnder15: f.u15 * s.u15,
    bttsSecondHalf: s.btts,
    homeScores: { first: f.hs, second: s.hs },
    awayScores: { first: f.as, second: s.as },
  };
}
