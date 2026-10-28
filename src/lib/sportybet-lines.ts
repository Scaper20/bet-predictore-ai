import "server-only";

import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { friendlyLabel, gridFor } from "@/lib/forge";
import { priceLeg, statFamilyOf, type LegPrice, type StatFamily } from "@/lib/leg-pricing";
import { fromSportyBet, readOdds } from "@/lib/odds/markets";
import { findOnBoard } from "@/lib/odds/sportybet";
import { statGridsFor } from "@/lib/stat-markets-service";
import { listedStatLines, type ListedLine } from "@/lib/board-pick";

/**
 * The lines SportyBet lists on a game beyond the main markets, each with the
 * model's chance: every handicap (Asian and three-way), draw no bet, team
 * goals, corners, shots, shots on target and bookings. Read off the stored
 * board (no extra SportyBet call), priced with the same grids as the rest of
 * the page (leg-pricing.ts), so a user can check any line they see there.
 */

export interface LineRow {
  market: string;
  label: string;
  /** Not a full loss (a refund or half settlement keeps a code alive). */
  probability: number;
  /** Of that, refunded or half-settled: whole and quarter lines. */
  refund: number;
  /** SportyBet's price now, if quoted. */
  price: number | null;
  /** The price at which the line breaks even on the model's numbers. */
  fair: number;
}

export interface LineGroup {
  key: string;
  title: string;
  rows: LineRow[];
}

/** Shown here; 1X2, double chance, totals, GG/NG and the combos have their own panels. */
const GROUPS: { key: string; title: string; test: (market: string) => boolean }[] = [
  { key: "ah", title: "Asian handicap", test: (m) => m.startsWith("ah:") },
  { key: "eh", title: "Three-way handicap", test: (m) => m.startsWith("eh:") },
  { key: "tg", title: "Team goals", test: (m) => m.startsWith("tg:") },
  { key: "corners", title: "Corners", test: (m) => m.startsWith("corners:") },
  { key: "shots", title: "Shots", test: (m) => m.startsWith("shots:") },
  { key: "sot", title: "Shots on target", test: (m) => m.startsWith("sot:") },
  { key: "bookings", title: "Bookings (yellow 1, red 2)", test: (m) => m.startsWith("bookings:") },
];

/** Break-even price: what a win (or half win) must pay to cover the losses. */
export function fairPrice(p: LegPrice): number {
  const back = p.win + p.halfWin / 2;
  if (back <= 0) return Infinity;
  return 1 + (p.lose + p.halfLose / 2) / back;
}

const lineOf = (market: string) => {
  const last = market.split(":").pop() ?? "";
  return /^[+-]?\d+(\.\d+)?$/.test(last) ? Number(last) : 0;
};

/**
 * The corners and shots lines SportyBet lists on this game, priced by the
 * model (board-pick.ts), for choosing a pick among them. Null when the game
 * isn't on SportyBet's board.
 */
export async function listedLinesFor(match: Match, prediction: Prediction): Promise<ListedLine[] | null> {
  const event = await findOnBoard(
    { homeName: match.home.name, awayName: match.away.name, kickoff: Date.parse(match.kickoff) },
    { leagueCode: match.league.code, matchId: match.id },
  ).catch(() => null);
  if (!event?.markets.length) return null;
  const stats = await statGridsFor(match).catch(() => ({}));
  const ctx = { goals: gridFor(prediction), stats };
  return listedStatLines(event.markets, (m) => priceLeg(m, ctx)?.survive ?? null);
}

export async function sportyBetLines(match: Match, prediction: Prediction): Promise<LineGroup[]> {
  const event = await findOnBoard(
    { homeName: match.home.name, awayName: match.away.name, kickoff: Date.parse(match.kickoff) },
    { leagueCode: match.league.code, matchId: match.id },
  ).catch(() => null);
  if (!event?.markets.length) return [];

  const goals = gridFor(prediction);
  let stats: Partial<Record<StatFamily, number[][]>> | null = null;
  const seen = new Set<string>();
  const byGroup = new Map<string, LineRow[]>();

  for (const m of event.markets) {
    for (const o of m.outcomes ?? []) {
      const market = fromSportyBet({ marketId: String(m.market_id), outcomeId: String(o.id), specifier: m.specifier ?? undefined });
      if (!market || seen.has(market)) continue;
      const group = GROUPS.find((g) => g.test(market));
      if (!group) continue;
      seen.add(market);
      if (statFamilyOf(market) && !stats) stats = await statGridsFor(match).catch(() => ({}));
      const price = priceLeg(market, { goals, stats: stats ?? {} });
      if (!price) continue;
      const row: LineRow = {
        market,
        label: friendlyLabel(market, match.home.name, match.away.name, market),
        probability: price.survive,
        refund: price.push + price.halfWin + price.halfLose,
        price: readOdds(o.odds) ?? null,
        fair: fairPrice(price),
      };
      byGroup.set(group.key, [...(byGroup.get(group.key) ?? []), row]);
    }
  }

  return GROUPS.flatMap((g) => {
    const rows = byGroup.get(g.key);
    if (!rows?.length) return [];
    // Same selection kinds together (home lines, then away), each by its line.
    rows.sort((a, b) => a.market.split(":").slice(0, -1).join(":").localeCompare(b.market.split(":").slice(0, -1).join(":")) || lineOf(a.market) - lineOf(b.market));
    return [{ key: g.key, title: g.title, rows }];
  });
}
