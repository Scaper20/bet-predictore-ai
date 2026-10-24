import { builderCombo, fromSportyBet, rawMarket, type SportyBetSelection } from "@/lib/odds/markets";
import type { ReadSource } from "@/lib/odds/market-read";
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
  /**
   * Our market id, a same-game combo for a Bet Builder. A SportyBet market we
   * have no id for is kept as SportyBet addresses it ("raw:...", markets.ts
   * rawMarket); null only for an empty builder.
   */
  market: string | null;
  /** The selections as SportyBet addresses them: one, or a Bet Builder's parts. */
  selections: SportyBetSelection[];
  homeName: string | null;
  awayName: string | null;
  kickoff: number | null;
  tournamentId: string | null;
  /** SportyBet's label, for showing a pick we can't read. */
  desc: string | null;
  /** SportyBet's market name ("Home Team Total Corners"), so an unread pick says what it is. */
  marketDesc?: string | null;
  /** SportyBet's current price; null for a Bet Builder, which SportyBet prices as a whole. */
  price: number | null;
  builder: boolean;
}

const selectionOf = (leg: TicketLeg): SportyBetSelection => ({
  marketId: leg.marketId,
  outcomeId: leg.outcomeId,
  ...(leg.specifier ? { specifier: leg.specifier } : {}),
});

/** Our market id for a selection, or SportyBet's own address for one we have none for. */
const marketOf = (leg: TicketLeg) => fromSportyBet(leg) ?? rawMarket(selectionOf(leg));

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
      market: marketOf(leg),
      selections: [selectionOf(leg)],
      homeName: leg.homeName,
      awayName: leg.awayName,
      kickoff: leg.kickoff,
      tournamentId: leg.tournamentId,
      desc: leg.desc,
      marketDesc: leg.marketDesc,
      price: leg.odds,
      builder: false,
    });
  }
  for (const parts of builders.values()) {
    const first = parts[0];
    out.push({
      eventId: first.eventId,
      market: parts.length === 1 ? marketOf(first) : builderCombo(parts.map(marketOf)),
      selections: parts.map(selectionOf),
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

export type Verdict = "strong" | "fair" | "risky" | "unreadable" | "locked";

/**
 * Our read of one pick. Strong from 65%, risky under 45%: the site's own risk
 * bands. A chance from a bare price is never called strong: the margin taken
 * off it is a guess.
 */
export function verdictFor(probability: number | null, source: ReadSource = "model"): Verdict {
  if (probability === null) return "unreadable";
  if (probability >= 0.65) return source === "odds" ? "fair" : "strong";
  if (probability < 0.45) return "risky";
  return "fair";
}

export interface ScoredGame extends CodeGame {
  matchId: string | null;
  leagueCode: string | null;
  /** The model's chance of this pick (or same-game combo) not losing: a refund keeps a code alive. */
  probability: number | null;
  /** Of that, the chance of a refund or half settlement on a whole or quarter line. */
  refund?: number;
  label: string;
  verdict: Verdict;
  /** Where the chance came from: the model, SportyBet's own probability, or its price alone. */
  source?: ReadSource;
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

/**
 * A free viewer's read: a game whose pick is still Pro-only (access.ts
 * proLeagueLocked: a Pro league before kick-off) keeps its game and pick but
 * loses the model's chance, so pasting a code never opens what the
 * predictions pages hold back. The code's own chance goes with it, since it
 * would give the hidden one away. A read from SportyBet's own numbers stays:
 * it is SportyBet's, not ours.
 */
export function lockGames<T extends { probability: number | null; verdict: Verdict; reason?: string; source?: ReadSource }>(
  games: readonly T[],
  locked: (game: T) => boolean,
): T[] {
  return games.map((g) =>
    g.probability !== null && (g.source ?? "model") === "model" && locked(g)
      ? { ...g, probability: null, verdict: "locked" as const, reason: "Pro league: our read opens at kick-off, or with Pro." }
      : g,
  );
}
