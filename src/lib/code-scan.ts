import "server-only";

import { candidatesFor, friendlyLabel, gridFor, halvesFor, type ForgeMarket } from "@/lib/forge";
import { priceLeg, refundShare, statFamilyOf, type StatFamily } from "@/lib/leg-pricing";
import { statChances, statGridsFor } from "@/lib/stat-markets-service";
import { keepOnBoard } from "@/lib/board-candidates";
import { LEG_MARKET_GAP } from "@/lib/market-check";
import type { BoardMarket } from "@/lib/odds/bookable";
import { findOnBoard } from "@/lib/odds/sportybet";
import type { EditorGame } from "@/lib/code-editor";
import { fromRaw, isRawMarket, toSportyBet, toSportyBetBuilder } from "@/lib/odds/markets";
import { rawGrader } from "@/lib/odds/raw-grades";
import { builderParts, marketRead, oddsOnly, type ReadSource } from "@/lib/odds/market-read";
import { dbUpcoming } from "@/lib/providers/db-source";
import { matchPrediction } from "@/lib/service";
import type { Prediction } from "@/lib/model/predict";
import { findFixture } from "@/lib/odds/match-fixture";
import { fetchEventMarkets, priceBetBuilder, readShareTicket } from "@/lib/odds/sportybet-direct";
import { allSportyBetTournaments } from "@/lib/odds/sportybet-links";
import { proLeagueLocked, type Viewer } from "@/lib/access";
import { gamesFromTicket, lockGames, scoreCode, verdictFor, type CodeGame, type CodeScore, type ScoredGame } from "./code-scan-core";

/**
 * Reads anyone's SportyBet code and puts the model on every game in it.
 *
 * The code is read from SportyBet itself (sportybet-direct.ts), each
 * selection turned into our market language (code-scan-core.ts), each game
 * found among our fixtures -- by the link the sync already made, else by
 * teams and kickoff within the same competition -- and each pick given the
 * model's own chance from that game's scoreline grid. A pick the model has
 * no read of (a market we don't model, a game outside our coverage) gets
 * SportyBet's own chance instead, marked as such (market-read.ts), so a code
 * is never refused for the markets people actually play. Nothing is guessed:
 * a pick neither we nor SportyBet can put a number on is shown as unread.
 */

export interface CodeScan extends CodeScore {
  code: string;
  /** When SportyBet stops loading the code: its first kick-off. */
  deadline: number | null;
  games: ScoredGame[];
  /** Predictions behind the read games, by match id, for the editor. */
  predictions: Map<string, Prediction>;
}

async function admin() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin();
}

/** Our match id for each SportyBet event the sync has already linked. */
async function linkedMatches(eventIds: readonly string[]): Promise<Map<string, { matchId: string; leagueCode: string }>> {
  const out = new Map<string, { matchId: string; leagueCode: string }>();
  if (eventIds.length === 0) return out;
  try {
    const { data } = await (await admin())
      .from("sportybet_event_links")
      .select("match_id, event_id, league_code")
      .in("event_id", [...new Set(eventIds)]);
    for (const r of data ?? []) out.set(r.event_id, { matchId: r.match_id, leagueCode: r.league_code });
  } catch {
    // Fall back to names below.
  }
  return out;
}

/** A game the sync never linked: find it by teams and kickoff in its competition. */
async function findByNames(game: CodeGame, leagueByTournament: Map<string, string>) {
  if (!game.tournamentId || !game.homeName || !game.awayName || !game.kickoff) return null;
  const leagueCode = leagueByTournament.get(game.tournamentId);
  if (!leagueCode) return null;
  const fixtures = await dbUpcoming(10, leagueCode).catch(() => []);
  const hit = findFixture(
    { homeName: game.homeName, awayName: game.awayName, kickoff: game.kickoff },
    fixtures.map((m) => ({ id: m.id, homeName: m.home.name, awayName: m.away.name, kickoff: Date.parse(m.kickoff) })),
  );
  return hit ? { matchId: hit.id, leagueCode } : null;
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * The model's chance of a pick (or same-game combo) not losing, from the
 * game's own grid: the scoreline grid for goals markets, the count grid for
 * corners, shots, shots on target and bookings. Null when there is no grid
 * for it (a competition without that statistic's history).
 */
export function chanceOf(
  p: Prediction,
  market: string,
  stats: Partial<Record<StatFamily, number[][]>> = {},
): { probability: number; refund: number } | null {
  const price = priceLeg(market, { goals: gridFor(p), halves: halvesFor(p), stats });
  if (!price) return null;
  return { probability: round4(price.survive), refund: round4(refundShare(price)) };
}

const STAT_REASON: Record<StatFamily, string> = {
  corners: "No corners history for this competition yet.",
  shots: "No shots history for this competition yet.",
  sot: "No shots-on-target history for this competition yet.",
  bookings: "No bookings history for this competition yet.",
};

/** "corners" for a raw corners market we price off the count grid (ranges, odd/even). */
function cornersRaw(market: string): StatFamily | null {
  const sel = fromRaw(market);
  return sel && rawGrader(sel)?.scope === "corners" ? "corners" : null;
}

/**
 * SportyBet's own chance for a game's pick, for one we have no model read of:
 * the probability it quotes on the event (market-read.ts), a Bet Builder's
 * from its pricing call, else from the price on the code alone.
 */
async function readFromSportyBet(g: CodeGame): Promise<{ probability: number; source: ReadSource; price: number | null } | null> {
  if (g.kickoff !== null && g.kickoff <= Date.now()) return null;
  const markets = await fetchEventMarkets(g.eventId).catch(() => null);
  if (g.selections.length === 1) {
    const read = (markets && marketRead(g.selections[0], markets)) ?? (g.price ? oddsOnly(g.price) : null);
    return read ? { ...read, price: g.price } : null;
  }
  const parts = markets && builderParts(g.eventId, g.selections, markets);
  const quote = parts ? await priceBetBuilder({ index: 0, eventId: g.eventId, parts }).catch(() => null) : null;
  if (!quote?.valid) return null;
  const read = quote.probability ? { probability: round4(quote.probability), source: "market" as const } : oddsOnly(quote.odds);
  return read ? { ...read, price: quote.odds } : null;
}

export async function scanCode(code: string): Promise<CodeScan | null> {
  const ticket = await readShareTicket(code);
  if (!ticket) return null;
  const games = gamesFromTicket(ticket.legs);
  const [links, tournaments] = await Promise.all([linkedMatches(games.map((g) => g.eventId)), allSportyBetTournaments()]);
  const leagueByTournament = new Map([...tournaments].map(([league, tid]) => [tid, league]));
  const predictions = new Map<string, Prediction>();

  const scored = await Promise.all(
    games.map(async (g): Promise<ScoredGame> => {
      const theirs = g.marketDesc && g.desc ? `${g.marketDesc}: ${g.desc}` : g.desc ?? "Pick";
      const raw = !g.market || isRawMarket(g.market);
      let base: ScoredGame = { ...g, matchId: null, leagueCode: null, probability: null, label: theirs, verdict: "unreadable" };
      let reason = "This game isn't in our coverage, and SportyBet no longer lists the pick.";

      const found = links.get(g.eventId) ?? (await findByNames(g, leagueByTournament));
      if (found) {
        const p = await matchPrediction(found.matchId).catch(() => null);
        const label = raw ? theirs : friendlyLabel(g.market!, g.homeName ?? "Home", g.awayName ?? "Away", g.desc ?? g.market!);
        base = { ...base, ...found, label };
        reason = "Not enough history on this game for a fair read, and SportyBet no longer lists the pick.";
        if (p && p.sufficiency.publishable) {
          // Kept even for a pick we read from SportyBet, so the editor can still re-pick the game.
          predictions.set(found.matchId, p);
          const family = g.market ? statFamilyOf(g.market) ?? cornersRaw(g.market) : null;
          const stats = family ? await statGridsFor(p.match).catch(() => ({})) : {};
          const priced = g.market ? chanceOf(p, g.market, stats) : null;
          if (priced) {
            const { probability, refund } = priced;
            return { ...base, probability, ...(refund > 0.005 ? { refund } : {}), verdict: verdictFor(probability), source: "model" };
          }
          reason = family ? `${STAT_REASON[family]} SportyBet no longer lists the pick either.` : "SportyBet no longer lists this pick.";
        }
      }

      // No read of ours: SportyBet's own chance, said as such.
      const read = await readFromSportyBet(g);
      if (read) {
        return { ...base, probability: read.probability, price: read.price, verdict: verdictFor(read.probability, read.source), source: read.source };
      }
      if (g.kickoff !== null && g.kickoff <= Date.now()) reason = "This game has started.";
      return { ...base, reason };
    }),
  );
  return { code: ticket.code, deadline: ticket.deadline, games: scored, predictions, ...scoreCode(scored) };
}

/**
 * The scan as this viewer may see it: a game still Pro-only for them loses
 * the model's chance (code-scan-core.ts lockGames) and its prediction, so the
 * editor cannot re-pick it either. Every route that returns a scan goes
 * through this.
 */
export function scanForViewer(scan: CodeScan, viewer: Viewer): CodeScan {
  const games = lockGames(
    scan.games,
    (g) =>
      !!g.matchId &&
      proLeagueLocked({ id: g.matchId, kickoff: new Date(g.kickoff ?? 0).toISOString(), league: { code: g.leagueCode } }, viewer),
  );
  const locked = new Set(games.filter((g) => g.verdict === "locked").map((g) => g.matchId));
  const predictions = new Map([...scan.predictions].filter(([id]) => !locked.has(id)));
  return { ...scan, games, predictions, ...scoreCode(games) };
}

/** What the editor may pick from: the markets Forge builds with, singles and same-game pairs. */
const EDITOR_MARKETS: ForgeMarket[] = ["result", "double_chance", "goals", "btts", "handicap", "corners", "shots"];

/** Per read game: what SportyBet lists on it, and the count model's numbers for corners and shots picks. */
export interface EditorContext {
  listings: Map<string, BoardMarket[]>;
  stats: Map<string, Record<string, number>>;
  grids: Map<string, Partial<Record<StatFamily, number[][]>>>;
}

export async function editorContext(scan: CodeScan): Promise<EditorContext> {
  const ctx: EditorContext = { listings: new Map(), stats: new Map(), grids: new Map() };
  await Promise.all(
    [...scan.predictions.values()].map(async (p) => {
      const id = p.match.id;
      const [event, stats, grids] = await Promise.all([
        findOnBoard(
          { homeName: p.match.home.name, awayName: p.match.away.name, kickoff: Date.parse(p.match.kickoff) },
          { leagueCode: p.match.league.code, matchId: id },
        ).catch(() => null),
        statChances(p.match).catch(() => undefined),
        statGridsFor(p.match).catch(() => ({})),
      ]);
      if (event?.markets.length) ctx.listings.set(id, event.markets);
      if (stats) ctx.stats.set(id, stats);
      ctx.grids.set(id, grids);
    }),
  );
  return ctx;
}

/**
 * The scanned code's games as the editor sees them (code-editor.ts): each read
 * game with its current pick and every pick the model offers on it that
 * SportyBet can also book. With the game's listing, a pick SportyBet doesn't
 * carry today becomes its same-chance twin or the nearest listed line
 * (board-candidates.ts); without it, anything SportyBet can address.
 */
export function editorGames(scan: CodeScan, ctx?: EditorContext): EditorGame[] {
  return scan.games.flatMap((g) => {
    const p = g.matchId ? scan.predictions.get(g.matchId) : undefined;
    if (!p || !g.matchId) return [];
    const all = candidatesFor(p, { markets: EDITOR_MARKETS, picksPerGame: 2, allowHandicap: true }, ctx?.stats.get(g.matchId));
    const listing = ctx?.listings.get(g.matchId);
    const pricing = { goals: gridFor(p), halves: halvesFor(p), stats: ctx?.grids.get(g.matchId) ?? {} };
    const bookable = listing
      ? keepOnBoard(all, listing, {
          home: p.match.home.name,
          away: p.match.away.name,
          price: (m) => priceLeg(m, pricing)?.survive ?? null,
          floor: (c) => c.probability - 0.05,
          marketGap: LEG_MARKET_GAP,
        })
      : all.filter((c) => toSportyBet(c.market) || toSportyBetBuilder(c.market));
    const candidates = bookable.map((c) => ({ market: c.market, label: c.label, probability: c.probability, fairOdds: c.fairOdds }));
    return [
      {
        matchId: g.matchId,
        homeName: p.match.home.name,
        awayName: p.match.away.name,
        kickoff: Date.parse(p.match.kickoff),
        league: p.match.league.name,
        current:
          g.market && g.probability
            ? { market: g.market, label: g.label, probability: g.probability, fairOdds: Math.round((1 / g.probability) * 100) / 100 }
            : null,
        candidates,
      },
    ];
  });
}
