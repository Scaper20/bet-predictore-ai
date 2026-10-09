import "server-only";

import type { Prediction } from "@/lib/model/predict";
import { cached } from "@/lib/providers/cache";
import { predictBatch, upcomingFeed } from "@/lib/service";
import { priceSelections } from "@/lib/odds";
import { windowFor } from "@/lib/time-windows";
import { COMBO_PREFIX } from "@/lib/slip-tracker";
import {
  candidatesFor,
  forge,
  type ForgeLeg,
  type ForgeRequestState,
  type ForgeResult,
  type ForgeSettings,
  type ForgeWhen,
} from "@/lib/forge";

/** Every modelled fixture kicking off in a window, predicted once and shared for five minutes. */
async function predictionsFor(when: ForgeWhen): Promise<Prediction[]> {
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

/** How long a slip waits for SportyBet prices before going out without the missing ones. */
const PRICE_BUDGET_MS = 12_000;

export interface ForgeResponse extends ForgeResult {
  scanned: number;
  pricedAt: string;
}

export async function buildForgeSlip(
  settings: ForgeSettings,
  state: ForgeRequestState,
  opts: { allowHandicap: boolean; leagueCodes: string[] | null },
): Promise<ForgeResponse> {
  const soon = Date.now() + 10 * 60_000;
  const predictions = (await predictionsFor(settings.when)).filter(
    (p) =>
      p.sufficiency.publishable &&
      Date.parse(p.match.kickoff) > soon &&
      (!opts.leagueCodes || opts.leagueCodes.includes(p.match.league.code ?? "")),
  );

  const pool = predictions.map((prediction) => ({
    prediction,
    candidates: candidatesFor(prediction, {
      markets: settings.markets,
      picksPerGame: settings.picksPerGame,
      allowHandicap: opts.allowHandicap,
    }),
  }));

  const result = forge(pool, settings, state);
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
  return { legs, bench, dropped: result.dropped, scanned: pool.length, pricedAt: new Date().toISOString() };
}
