/**
 * Matching a BetriX fixture to a bookmaker's fixture.
 *
 * There is no shared id. BetriX identifies a match by whichever provider
 * supplied it ("fd:12345", "sdb:98765"); SportyBet uses Sportradar
 * ("sr:match:72221248"). So a price can only be attached to a prediction by
 * agreeing on the teams and the kickoff.
 *
 * This is the part most likely to go wrong quietly, and the failure is not a
 * blank — it is a price from the wrong game presented as this game's. The whole
 * value feature is telling a user what a price is worth, so a mismatched price
 * is worse than none. Everything below is biased hard toward refusing.
 *
 * The hard case is that bookmakers abbreviate. SportyBet lists "Newcastle"
 * where the feeds say "Newcastle United", and the model's own normaliseKey —
 * which only ever has to match names within one feed — maps those to
 * "newcastle" and "newcastleutd". They do not compare equal.
 *
 * The obvious fix, stripping "United" and "City", is a trap: it collapses
 * Manchester United and Manchester City into one club, and would hand a user
 * one team's price for the other's match. So instead an abbreviation is only
 * accepted when it is UNAMBIGUOUS among the candidates actually on offer —
 * "newcastle" extends to exactly one fixture, while "manchester" extends to
 * two and is therefore refused. Ambiguity resolves to no price, never a guess.
 */

import { normaliseKey } from "@/lib/model/fit";

/** The minimum a candidate must carry to be considered at all. */
export interface FixtureLike {
  homeName: string;
  awayName: string;
  /** Epoch milliseconds. */
  kickoff: number;
}

/**
 * How far apart two records of the same kickoff may sit.
 *
 * Six hours. Feeds disagree by minutes over timezone handling and by an hour
 * or two when a fixture moves, but two league meetings of the same pair are
 * months apart — wide enough to absorb the disagreement, far too narrow to
 * confuse the reverse fixture.
 */
export const KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * Below this many characters, one name being the start of another says
 * nothing at all.
 *
 * Three, not more, because normaliseKey already contracts the longest names:
 * it rewrites "Manchester" to "man", so a four-character floor would reject
 * the very abbreviations this exists to catch. The floor is not what keeps
 * this safe — the ambiguity check in findFixture is. A three-letter stub is
 * allowed to be suggestive precisely because it is only ever accepted when
 * exactly one fixture in the window could be it.
 */
const MIN_ABBREVIATION = 3;

/**
 * True when two normalised club names could be the same club written at
 * different lengths.
 *
 * Prefix only, never a substring or an edit distance. "newcastle" opens
 * "newcastleutd", which is how the abbreviation actually works; nothing here
 * would accept "united" for "newcastleutd".
 */
function couldBeSameClub(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_ABBREVIATION) return false;
  return long.startsWith(short);
}

/**
 * The candidate describing the same fixture, or null.
 *
 * Exact agreement on both clubs wins outright. Failing that, an abbreviated
 * name is accepted only when exactly one candidate could be it — more than one
 * and the fixture is genuinely ambiguous, which is the Manchester case, and
 * returns null.
 */
export function findFixture<T extends FixtureLike>(
  target: FixtureLike,
  candidates: T[],
): T | null {
  const home = normaliseKey(target.homeName);
  const away = normaliseKey(target.awayName);
  if (!home || !away) return null;

  const inWindow = candidates.filter(
    (c) => Math.abs(c.kickoff - target.kickoff) <= KICKOFF_TOLERANCE_MS,
  );

  const exact = inWindow.filter(
    (c) => normaliseKey(c.homeName) === home && normaliseKey(c.awayName) === away,
  );
  if (exact.length > 0) return closest(target, exact);

  // Both sides, and in the same orientation: a fixture with the teams the
  // other way round is a different match at a different ground.
  const loose = inWindow.filter(
    (c) =>
      couldBeSameClub(normaliseKey(c.homeName), home) &&
      couldBeSameClub(normaliseKey(c.awayName), away),
  );

  // Exactly one, or nothing. Two candidates an abbreviation could describe is
  // precisely the case where guessing costs a user money.
  return loose.length === 1 ? loose[0] : null;
}

function closest<T extends FixtureLike>(target: FixtureLike, list: T[]): T {
  return list.reduce((best, c) =>
    Math.abs(c.kickoff - target.kickoff) < Math.abs(best.kickoff - target.kickoff) ? c : best,
  );
}
