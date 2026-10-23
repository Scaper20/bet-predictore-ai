import { builderCombo, fromSportyBet } from "@/lib/odds/markets";
import type { TicketLeg } from "@/lib/odds/sportybet-api";

/**
 * Reading someone's SportyBet code the way our model reads a match: the pure
 * half of code-scan.ts. A code is a list of SportyBet selections; this turns
 * it into one pick per game in our own market language (a Bet Builder's parts
 * become one same-game combo), and scores the result once the model's
 * chances are known.
 */

/** One game on a code, as our market id, before the model has looked at it. */
export interface CodeGame {
  eventId: string;
  /** Our market id, a same-game combo for a Bet Builder; null when we do not read it. */
  market: string | null;
  homeName: string | null;
  awayName: string | null;
  kickoff: number | null;
  tournamentId: string | null;
  /** SportyBet's label, for showing a pick we can't read. */
  desc: string | null;
  /** SportyBet's current price; null for a Bet Builder, which SportyBet prices as a whole. */
  price: number | null;
  builder: boolean;
}

/** Selections grouped into games: a Bet Builder's parts (one shared parent) are one game. */
export function gamesFromTicket(legs: readonly TicketLeg[]): CodeGame[] {
  const out: CodeGame[] = [];
  const builders = new Map<string, TicketLeg[]>();
  for (const leg of legs) {
    if (leg.parentBetBuilderMarketId) {
      const list = builders.get(leg.parentBetBuilderMarketId) ?? [];
      list.push(leg);
      builders.set(leg.parentBetBuilderMarketId, list);
      continue;
    }
    out.push({
      eventId: leg.eventId,
      market: fromSportyBet(leg),
      homeName: leg.homeName,
      awayName: leg.awayName,
      kickoff: leg.kickoff,
      tournamentId: leg.tournamentId,
      desc: leg.desc,
      price: leg.odds,
      builder: false,
    });
  }
  for (const parts of builders.values()) {
    const markets = parts.map((p) => fromSportyBet(p));
    const first = parts[0];
    out.push({
      eventId: first.eventId,
      market: markets.every((m): m is string => m !== null) ? builderCombo(markets) : null,
      homeName: first.homeName,
      awayName: first.awayName,
      kickoff: first.kickoff,
      tournamentId: first.tournamentId,
      desc: parts.map((p) => p.desc ?? "?").join(" + "),
      price: null,
      builder: true,
    });
  }
  return out.sort((a, b) => (a.kickoff ?? Infinity) - (b.kickoff ?? Infinity));
}

export type Verdict = "strong" | "fair" | "risky" | "unreadable";

/** Our read of one pick. Strong from 65%, risky under 45%: the site's own risk bands. */
export function verdictFor(probability: number | null): Verdict {
  if (probability === null) return "unreadable";
  if (probability >= 0.65) return "strong";
  if (probability < 0.45) return "risky";
  return "fair";
}

export interface ScoredGame extends CodeGame {
  matchId: string | null;
  leagueCode: string | null;
  /** The model's chance of this pick (or same-game combo) landing. */
  probability: number | null;
  label: string;
  verdict: Verdict;
  /** Why a game could not be read, in plain words. */
  reason?: string;
}

export interface CodeScore {
  /** The model's chance of every game landing; null when any game is unread. */
  chance: number | null;
  /** The product of SportyBet's current prices, where all are known. */
  odds: number | null;
  /**
   * chance × odds: above 1, SportyBet is paying more than the model thinks
   * the code is worth; below 1, less. Null without both.
   */
  fairness: number | null;
  readable: number;
  total: number;
}

export function scoreCode(games: readonly ScoredGame[]): CodeScore {
  const readable = games.filter((g) => g.probability !== null).length;
  const chance = readable === games.length && games.length > 0 ? games.reduce((p, g) => p * g.probability!, 1) : null;
  const odds = games.length > 0 && games.every((g) => g.price !== null) ? games.reduce((p, g) => p * g.price!, 1) : null;
  return {
    chance: chance === null ? null : Math.round(chance * 10_000) / 10_000,
    odds: odds === null ? null : Math.round(odds * 100) / 100,
    fairness: chance !== null && odds !== null ? Math.round(chance * odds * 1000) / 1000 : null,
    readable,
    total: games.length,
  };
}
