import "server-only";

import type { Prediction } from "@/lib/model/predict";
import { cached } from "@/lib/providers/cache";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { priceSelections } from "@/lib/odds";
import { windowFor } from "@/lib/time-windows";
import { proLeagueLocked, type Viewer } from "@/lib/access";
import { COMBO_PREFIX } from "@/lib/slip-tracker";
import { statChances, statGridsFor } from "@/lib/stat-markets-service";
import { keepOnBoard } from "@/lib/board-candidates";
import { LEG_MARKET_GAP } from "@/lib/market-check";
import { priceLeg } from "@/lib/leg-pricing";
import type { BoardMarket } from "@/lib/odds/bookable";
import { priceOn, toSportyBet } from "@/lib/odds/markets";
import { listingsFor } from "@/lib/odds/sportybet";
import {
  candidatesFor,
  forgeBest,
  gridFor,
  legFloorFor,
  type ForgeLeg,
  type ForgeRequestState,
  type ForgeResult,
  type ForgeSettings,
  type ForgeWhen,
} from "@/lib/forge";

/** Every modelled fixture kicking off in a window, predicted once and shared for five minutes. */
export async function predictionsFor(when: ForgeWhen): Promise<Prediction[]> {
  return cached(`forge:pool:${when}`, 5 * 60_000, async () => {
    const { matches } = await upcomingFeed(7);
    const [from, to] = windowFor(when);
    const inWindow = matches.filter((m) => {
      const t = Date.parse(m.kickoff);
      return m.status === "scheduled" && Boolean(m.league.code) && t >= from && t < to;
    });
    return predictBatch(inWindow, 80);
  });
}

/**
 * What SportyBet lists on each fixture in a window, by match id, read off the
 * stored boards once and shared for five minutes like the pool. A fixture
 * missing here isn't on SportyBet's board (or the board has no markets).
 */
async function forgeListings(when: ForgeWhen, predictions: readonly Prediction[]): Promise<Map<string, BoardMarket[]>> {
  return cached(`forge:boards:${when}`, 5 * 60_000, async () => {
    const out = new Map<string, BoardMarket[]>();
    const events = await listingsFor(predictions.map((p) => p.match), 8_000);
    for (const [id, event] of events) if (event.markets.length) out.set(id, event.markets);
    return out;
  });
}

/** How long a slip waits for SportyBet prices before going out without the missing ones. */
const PRICE_BUDGET_MS = 12_000;

export interface ForgeResponse extends ForgeResult {
  scanned: number;
  pricedAt: string;
  /** Games in the window and leagues asked for, left out because they are in a Pro league (free plan). */
  proHeld: number;
}

export async function buildForgeSlip(
  settings: ForgeSettings,
  state: ForgeRequestState,
  opts: { allowHandicap: boolean; leagueCodes: string[] | null; viewer?: Viewer | null },
): Promise<ForgeResponse> {
  const soon = Date.now() + 10 * 60_000;
  const eligible = (await predictionsFor(settings.when)).filter(
    (p) =>
      p.sufficiency.publishable &&
      Date.parse(p.match.kickoff) > soon &&
      (!opts.leagueCodes || opts.leagueCodes.includes(p.match.league.code ?? "")),
  );
  const predictions = opts.viewer ? eligible.filter((p) => !proLeagueLocked(p.match, opts.viewer!)) : eligible;
  const proHeld = eligible.length - predictions.length;

  // Corners and shots chances only when asked for: one count-model fit per competition, shared.
  const wantsStats = settings.markets.includes("corners") || settings.markets.includes("shots");
  const [stats, grids, listings] = await Promise.all([
    wantsStats ? Promise.all(predictions.map((p) => statChances(p.match).catch(() => undefined))) : [],
    wantsStats ? Promise.all(predictions.map((p) => statGridsFor(p.match).catch(() => ({})))) : [],
    forgeListings(settings.when, await predictionsFor(settings.when)).catch(() => new Map<string, BoardMarket[]>()),
  ]);

  // Board first: on a game SportyBet lists, a leg it doesn't carry becomes its
  // same-chance twin or the nearest listed line that still clears the build's
  // floor (board-candidates.ts), so a built combo can be booked as shown.
  const legFloor = legFloorFor(settings.targetOdds);
  const pool = predictions.map((prediction, i) => {
    const candidates = candidatesFor(
      prediction,
      { markets: settings.markets, picksPerGame: settings.picksPerGame, allowHandicap: opts.allowHandicap },
      stats[i],
    );
    const markets = listings.get(prediction.match.id);
    if (!markets) return { prediction, candidates };
    const ctx = { goals: gridFor(prediction), stats: grids[i] ?? {} };
    return {
      prediction,
      candidates: keepOnBoard(candidates, markets, {
        home: prediction.match.home.name,
        away: prediction.match.away.name,
        price: (m) => priceLeg(m, ctx)?.survive ?? null,
        floor: (c) => Math.max(legFloor, c.probability - 0.05),
        marketGap: LEG_MARKET_GAP,
      }),
    };
  });

  // Best first: the strongest reads on the card until the price is reached (lib/forge.ts).
  const result = forgeBest(pool, settings, state);
  const byId = new Map(predictions.map((p) => [p.match.id, p]));

  // SportyBet prices for single picks. Combos stay at the model's fair odds:
  // a bookmaker prices a same-game combo its own way, and we won't guess it.
  // Prices are a nicety on a slip the model has already built, so they get a
  // fixed budget: a leg not priced by then shows without one, as an unlisted
  // game does, rather than the whole request running into the 60-second limit.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PRICE_BUDGET_MS);
  });
  const price = async (leg: ForgeLeg): Promise<ForgeLeg> => {
    if (leg.market.startsWith(COMBO_PREFIX)) return leg;
    // Listed: the price is on the board already read, swapped lines included.
    const sel = toSportyBet(leg.market);
    const listed = sel && listings.get(leg.matchId);
    const onBoard = listed ? priceOn(sel, listed) : undefined;
    if (onBoard !== undefined) return { ...leg, price: onBoard };
    const p = byId.get(leg.matchId);
    const pick = p?.picks.find((pk) => pk.market === leg.market);
    if (!p || !pick) return leg;
    const lookup = priceSelections(p.match, [pick])
      .then((r) => r[0]?.local ?? null)
      .catch(() => null);
    const local = await Promise.race([lookup, deadline]);
    return { ...leg, price: local };
  };

  const [legs, bench] = await Promise.all([Promise.all(result.legs.map(price)), Promise.all(result.bench.map(price))]);
  clearTimeout(timer);
  return { legs, bench, dropped: result.dropped, scanned: pool.length, proHeld, pricedAt: new Date().toISOString() };
}
