import type { ResultRow } from "@/lib/types";

/**
 * A domestic cup's training rows without the ties no catalogued club plays in.
 *
 * TheSportsDB lists the FA Cup from its extra preliminary round: some 600
 * non-league ties a season, more than the cup's proper rounds and the
 * leagues' crossover games together. In a pooled fit they swamp the league
 * clubs' ties: walk-forward on the production archive, picks on FA Cup ties
 * between league clubs landed 49% with them and 74.5% without. A club seen
 * only in those rounds gets no pick either way (too few appearances).
 *
 * Run on canonical names (after canonicaliseRows), so "Man City" in the
 * league archive and "Manchester City" in the cup's are one club.
 */
export function leagueClubTies(rows: ResultRow[], cupCode: string): ResultRow[] {
  const clubs = new Set<string>();
  for (const r of rows) {
    if (r.leagueId === cupCode) continue;
    clubs.add(r.homeName);
    clubs.add(r.awayName);
  }
  return rows.filter((r) => r.leagueId !== cupCode || clubs.has(r.homeName) || clubs.has(r.awayName));
}
