/**
 * Grades a logged pick against a fixture's final score.
 *
 * Only markets the site's headline "top pick" can ever select need grading
 * here — see rankPicks/pickScore in model/predict.ts, which excludes Asian
 * Handicap from topPick ranking entirely (score -1), so handicap lines never
 * reach predictions_log and are deliberately not handled below.
 */
export type PickResult = "win" | "lose" | "push";

export function evaluatePick(
  market: string,
  homeGoals: number,
  awayGoals: number,
): PickResult | null {
  const total = homeGoals + awayGoals;

  switch (market) {
    case "1x2:home":
      return homeGoals > awayGoals ? "win" : "lose";
    case "1x2:draw":
      return homeGoals === awayGoals ? "win" : "lose";
    case "1x2:away":
      return awayGoals > homeGoals ? "win" : "lose";
    case "dc:home-draw":
      return homeGoals >= awayGoals ? "win" : "lose";
    case "dc:away-draw":
      return awayGoals >= homeGoals ? "win" : "lose";
    case "dc:home-away":
      return homeGoals !== awayGoals ? "win" : "lose";
    case "btts:yes":
      return homeGoals > 0 && awayGoals > 0 ? "win" : "lose";
    case "btts:no":
      return homeGoals > 0 && awayGoals > 0 ? "lose" : "win";
  }

  const over = market.match(/^ou:over:(\d+(?:\.\d+)?)$/);
  if (over) {
    const line = Number(over[1]);
    if (total > line) return "win";
    if (total < line) return "lose";
    return "push";
  }

  const under = market.match(/^ou:under:(\d+(?:\.\d+)?)$/);
  if (under) {
    const line = Number(under[1]);
    if (total < line) return "win";
    if (total > line) return "lose";
    return "push";
  }

  const correctScore = market.match(/^cs:(\d+)-(\d+)$/);
  if (correctScore) {
    const h = Number(correctScore[1]);
    const a = Number(correctScore[2]);
    return homeGoals === h && awayGoals === a ? "win" : "lose";
  }

  return null;
}
