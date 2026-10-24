/**
 * Grades a logged pick against a fixture's final score.
 *
 * Covers every market a published pick can carry, Asian handicap included:
 * the digest and Code Hub may use half-goal handicap lines, and quarter lines
 * settle as a push when they half-win or half-lose (the slip tracker's rule).
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
    // Draw no bet: the stake back on a draw.
    case "dnb:home":
      return homeGoals > awayGoals ? "win" : homeGoals === awayGoals ? "push" : "lose";
    case "dnb:away":
      return awayGoals > homeGoals ? "win" : homeGoals === awayGoals ? "push" : "lose";
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

  const ah = market.match(/^ah:(home|away):([+-]?\d+(?:\.\d+)?)$/);
  if (ah) return gradeHandicap(ah[1] as "home" | "away", Number(ah[2]), homeGoals, awayGoals);

  // Three-way handicap: the home line added to the home side's goals, then a
  // plain result; "eh:draw:-1" wins when the home side wins by exactly one.
  const eh = market.match(/^eh:(home|draw|away):([+-]?\d+)$/);
  if (eh) {
    const margin = homeGoals - awayGoals + Number(eh[2]);
    const side = margin > 0 ? "home" : margin < 0 ? "away" : "draw";
    return side === eh[1] ? "win" : "lose";
  }

  const teamGoals = market.match(/^tg:(home|away):(over|under):(\d+(?:\.\d+)?)$/);
  if (teamGoals) {
    const goals = teamGoals[1] === "home" ? homeGoals : awayGoals;
    const line = Number(teamGoals[3]);
    if (goals === line) return "push";
    return (goals > line) === (teamGoals[2] === "over") ? "win" : "lose";
  }

  const correctScore = market.match(/^cs:(\d+)-(\d+)$/);
  if (correctScore) {
    const h = Number(correctScore[1]);
    const a = Number(correctScore[2]);
    return homeGoals === h && awayGoals === a ? "win" : "lose";
  }

  return null;
}

/** An Asian handicap line against a score; a quarter line that splits settles as a push. */
export function gradeHandicap(side: "home" | "away", line: number, home: number, away: number): PickResult {
  const quarter = Math.abs((line * 4) % 2) === 1;
  if (quarter) {
    const a = gradeHandicap(side, line - 0.25, home, away);
    const b = gradeHandicap(side, line + 0.25, home, away);
    if (a === b) return a;
    return a === "push" ? b : b === "push" ? a : "push";
  }
  const margin = (side === "home" ? home - away : away - home) + line;
  return margin > 0 ? "win" : margin < 0 ? "lose" : "push";
}

/** The statistic a corners, shots or shots-on-target pick is graded on; null for a goals pick. */
export function statKindOf(market: string): "corners" | "shots" | "shotsOnTarget" | null {
  const family = market.split(":")[0];
  return family === "corners" ? "corners" : family === "shots" ? "shots" : family === "sot" ? "shotsOnTarget" : null;
}

/** The count families a pick can carry; bookings are priced and read, not yet graded from results. */
const STAT_FAMILIES = new Set(["corners", "shots", "sot", "bookings"]);

/**
 * Grades a corners, shots, shots-on-target or bookings pick against the
 * match's counts (home, away). Markets as stat sweet spots and SportyBet name
 * them: totals ("corners:under:12.5"), team totals ("sot:home:over:3.5"), who
 * had more ("sot:most:home-or-level", "corners:most:level") and handicaps
 * ("sot:hcp:away:+3.5").
 */
export function evaluateStatPick(market: string, home: number, away: number): PickResult | null {
  if (!STAT_FAMILIES.has(market.split(":")[0])) return null;
  const [, a, b, c] = market.split(":");
  const vs = (x: number, line: number, over: boolean): PickResult => (x === line ? "push" : (x > line) === over ? "win" : "lose");
  if (a === "over" || a === "under") return vs(home + away, Number(b), a === "over");
  if ((a === "home" || a === "away") && (b === "over" || b === "under")) return vs(a === "home" ? home : away, Number(c), b === "over");
  if (a === "most") {
    if (b === "home") return home > away ? "win" : "lose";
    if (b === "away") return away > home ? "win" : "lose";
    if (b === "home-or-level") return home >= away ? "win" : "lose";
    if (b === "away-or-level") return away >= home ? "win" : "lose";
    if (b === "level") return home === away ? "win" : "lose";
    return null;
  }
  if (a === "hcp" && (b === "home" || b === "away")) return gradeHandicap(b, Number(c), home, away);
  return null;
}
