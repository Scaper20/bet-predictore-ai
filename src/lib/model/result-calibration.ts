/**
 * The model's straight-win chances, corrected by its own graded record.
 * Off on the site: a lab option (ModelOptions.resultCalibration), kept for
 * the reason below.
 *
 * Replayed walk-forward over 17 European divisions (scripts/niche-lab.ts,
 * 12,749 fixtures, July 2024 to October 2026), the goals model under-rated
 * clear favourites: a home win it called 70-80% landed 82-84%, one it called
 * 60-70% landed 68-72%, in both seasons alike. The fit's caution (ratings and
 * totals shrunk toward the league) pulls strong sides back toward the draw.
 *
 * The correction is Platt scaling, fitted on that record: logit(q) = a + b
 * logit(p), one pair for the home win and one for the away win, the draw
 * taking up the rest. The scoreline grid is then re-weighted so its 1X2
 * matches (home-win cells, draw cells and away-win cells each scaled), so
 * double chance, handicaps and every other market derived from the grid move
 * with it and stay consistent.
 *
 * Fitted on July 2024 to June 2025 and tested on the season after, it brought
 * straight wins to their stated rate over all fixtures (60-70%: 66% landed
 * against 64%; 70-80%: 78% against 75%) and lowered the Brier score of
 * results, team goals and handicaps a little. But it made the published
 * picks worse: ranked on corrected chances, the headline picks landed 72.4%
 * against 75.5% for the raw model (scripts/decision-lab.ts, last 365 days).
 * The corrected favourites it promoted were home wins in low-scoring games,
 * which landed 66%; the one-pair stretch ignores how many goals a game will
 * have, and those are the games where a favourite most often draws. Until a
 * correction raises the hit rate of what the site publishes, the site keeps
 * the model's own numbers.
 *
 * Fitted only where it was shown to hold: the European divisions and the UEFA
 * club cups (straight wins there landed 73% against 63% stated). In MLS, Liga
 * MX and Brazil the raw chances were already right or too high.
 *
 * Refit: npx tsx scripts/niche-lab.ts --stage=predict, then --stage=analyse,
 * which prints the pair fitted on everything.
 */

export interface PlattPair {
  a: number;
  b: number;
}

export interface ResultCalibration {
  home: PlattPair;
  away: PlattPair;
}

/** Fitted on all 12,749 replayed fixtures (October 2026). */
export const RESULT_CALIBRATION: ResultCalibration = {
  home: { a: 0.075, b: 1.282 },
  away: { a: 0.146, b: 1.263 },
};

export const RESULT_CALIBRATION_LEAGUES: ReadonlySet<string> = new Set([
  "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
  "championship", "eredivisie", "primeira-liga", "scottish-premiership",
  "belgian-pro-league", "super-lig", "greek-super-league", "league-one",
  "bundesliga-2", "serie-b", "la-liga-2", "ligue-2",
  "champions-league", "europa-league", "conference-league",
]);

/** The correction for a competition, or null where it was not shown to hold. */
export function resultCalibrationFor(leagueCode: string | undefined): ResultCalibration | null {
  return leagueCode && RESULT_CALIBRATION_LEAGUES.has(leagueCode) ? RESULT_CALIBRATION : null;
}

const MIN_DRAW = 0.08;

export function plattScale(c: PlattPair, p: number): number {
  const q = Math.min(0.999, Math.max(0.001, p));
  return 1 / (1 + Math.exp(-(c.a + c.b * Math.log(q / (1 - q)))));
}

/** The grid with its home-win, draw and away-win cells re-weighted to the corrected 1X2. In place. */
export function calibrateResult(grid: number[][], c: ResultCalibration): number[][] {
  let h = 0, d = 0, a = 0;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      if (x > y) h += grid[x][y];
      else if (x === y) d += grid[x][y];
      else a += grid[x][y];
    }
  }
  if (h <= 0 || d <= 0 || a <= 0) return grid;
  let qh = plattScale(c.home, h);
  let qa = plattScale(c.away, a);
  let qd = Math.max(MIN_DRAW, 1 - qh - qa);
  const z = qh + qd + qa;
  qh /= z; qd /= z; qa /= z;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      grid[x][y] *= x > y ? qh / h : x === y ? qd / d : qa / a;
    }
  }
  return grid;
}
