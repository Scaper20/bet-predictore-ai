import type { SportyBetEvent } from "./sportybet-api";
import { matchRound, type MatchInput, type OurFixture } from "./sportybet-match";

/**
 * Finding a competition's SportyBet tournament from evidence, not from its
 * name.
 *
 * leagues.ts carries hand-checked tournament ids for a dozen competitions;
 * the rest would otherwise have no prices and no codes. Matching "Turkish
 * Süper Lig" to "Turkiye / Super Lig" by name is how a women's league or a
 * simulated-reality copy gets picked (both sit on SportyBet's board under
 * near-identical names). So instead: take our own upcoming fixtures for the
 * competition, run the same matcher that links fixtures for booking against
 * each tournament on SportyBet's board, and count where they land.
 *
 * Measured on 23 Oct across 14 competitions: our fixtures land in one
 * tournament per competition, with stray single votes for a women's league,
 * an SRL copy and a U19 league -- which is what the rules below are for.
 */

/** Tournaments that are never a senior men's competition of ours. */
const NOT_OURS = /women|female|\bsrl\b|simulated|primavera|\bu-?1\d\b|\bu-?2[0-3]\b|youth|reserve|amateur|e-?soccer|virtual|cyber/i;

export interface TournamentTally {
  tournamentId: string;
  name: string;
  category: string;
  /** Our fixtures the matcher found in this tournament. */
  votes: number;
}

export interface Discovery {
  best: TournamentTally | null;
  runnerUp: TournamentTally | null;
  /** trusted: use it now. pending: an admin decides. null: not enough evidence. */
  decision: "trusted" | "pending" | null;
  tally: TournamentTally[];
}

/** Strongest evidence that is still not a coincidence. */
export const TRUST_MIN_VOTES = 4;
export const TRUST_MIN_SHARE = 0.8;
export const TRUST_MIN_MARGIN = 2;

export function voteTournaments(
  league: { name: string },
  fixtures: readonly OurFixture[],
  board: readonly SportyBetEvent[],
  memory: Pick<MatchInput, "aliases"> = {},
): Discovery {
  const ownNoise = NOT_OURS.test(league.name);
  const groups = new Map<string, SportyBetEvent[]>();
  for (const e of board) {
    if (!e.tournamentId) continue;
    if (!ownNoise && NOT_OURS.test(`${e.tournamentName ?? ""} ${e.category ?? ""}`)) continue;
    groups.set(e.tournamentId, [...(groups.get(e.tournamentId) ?? []), e]);
  }

  const tally: TournamentTally[] = [];
  for (const [tournamentId, events] of groups) {
    // Names and anchors only: no learned ids exist for a competition we have
    // never linked, and elimination needs a known round.
    const votes = matchRound({ ...memory, fixtures, events }).matched.length;
    if (votes > 0) {
      tally.push({ tournamentId, name: events[0].tournamentName ?? "", category: events[0].category ?? "", votes });
    }
  }
  tally.sort((a, b) => b.votes - a.votes);

  const [best = null, runnerUp = null] = tally;
  const total = tally.reduce((n, t) => n + t.votes, 0);
  const second = runnerUp?.votes ?? 0;
  let decision: Discovery["decision"] = null;
  if (best) {
    const clear =
      best.votes >= TRUST_MIN_VOTES && best.votes >= TRUST_MIN_SHARE * total && best.votes - second >= TRUST_MIN_MARGIN;
    // A small cup round: every match found, in one place, and nowhere else.
    const unanimous = best.votes >= 3 && second === 0;
    if (clear || unanimous) decision = "trusted";
    else if (best.votes >= 2 && best.votes > second) decision = "pending";
  }
  return { best, runnerUp, decision, tally };
}
