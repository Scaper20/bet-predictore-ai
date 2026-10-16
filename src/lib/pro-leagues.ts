/**
 * Pro leagues: the competitions where free accounts see the pick only from
 * kick-off (lib/access.ts proLeagueLocked).
 *
 * Chosen October 2026 from a 12-month walk-forward replay of Strike 2
 * (scripts/league-lab.ts, 6,951 picks over 20 leagues): a league is Pro when
 * its pick hit rate is 76.5% or better, at least 1.5 points above the 75.0%
 * average. Every cup and continental club competition is Pro whatever its
 * numbers. National-team competitions and every other league stay free.
 *
 * Reviewed on the 1st of each month against the replay and the live record;
 * a league moves only after a full month on the other side of the line.
 */

export interface ProLeague {
  code: string;
  /** 12-month replay pick hit rate, or null for cups (rated on the rule, not the number). */
  replayHit: number | null;
}

export const PRO_LEAGUES: readonly ProLeague[] = [
  { code: "primeira-liga", replayHit: 0.785 },
  { code: "serie-b", replayHit: 0.784 },
  { code: "eredivisie", replayHit: 0.779 },
  { code: "bundesliga", replayHit: 0.773 },
  { code: "belgian-pro-league", replayHit: 0.771 },
  { code: "serie-a", replayHit: 0.77 },
  { code: "league-one", replayHit: 0.769 },
  { code: "championship", replayHit: 0.767 },
  { code: "champions-league", replayHit: null },
  { code: "europa-league", replayHit: null },
  { code: "conference-league", replayHit: null },
  { code: "caf-champions-league", replayHit: null },
  { code: "fa-cup", replayHit: null },
  { code: "efl-cup", replayHit: null },
  { code: "coppa-italia", replayHit: null },
];

const CODES: ReadonlySet<string> = new Set(PRO_LEAGUES.map((l) => l.code));

export function isProLeague(code: string | null | undefined): boolean {
  return Boolean(code && CODES.has(code));
}

export const PRO_LEAGUE_COUNT = PRO_LEAGUES.length;

/** Pick hit rate across the Pro leagues in the replay, for copy ("77% of picks landed"). */
export const PRO_LEAGUE_REPLAY_HIT = 0.774;

/** Why a league is Pro, for a sentence that already names it ("77% of the model's picks landed…"). */
export function proLeagueReason(code: string | null | undefined): string {
  const hit = PRO_LEAGUES.find((l) => l.code === code)?.replayHit;
  return hit
    ? `${Math.round(hit * 100)}% of the model's picks here landed over the last year.`
    : "Every cup and continental competition is a Pro league.";
}

/** One line for upgrade prompts on a Pro-league match. */
export function proLeagueLine(code: string | null | undefined, name: string): string {
  const hit = PRO_LEAGUES.find((l) => l.code === code)?.replayHit;
  return hit
    ? `${name} is a Pro league: ${Math.round(hit * 100)}% of the model's picks landed over the last year.`
    : `${name} is a Pro league: every cup and continental competition is.`;
}
