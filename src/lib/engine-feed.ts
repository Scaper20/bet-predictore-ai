import "server-only";

import { confidenceFor, type Pick, type Prediction } from "@/lib/model/predict";
import { fairOdds } from "@/lib/model/odds";
import { friendlyLabel, gridFor } from "@/lib/forge";
import { priceLeg } from "@/lib/leg-pricing";
import { fairChanceOn } from "@/lib/odds/market-prob";
import { priceOn, toSportyBet } from "@/lib/odds/markets";
import type { RawMarket } from "@/lib/odds/sportybet-api";
import type { ListedLine } from "@/lib/board-pick";
import { chooseHeadline, groupOf, groupPicks, type EngineCandidate, type EngineChoice, type EnginePick, type EngineRead } from "@/lib/model/headline-engine";

/**
 * The headline engine (model/headline-engine.ts) run on a live prediction:
 * the goals candidates priced off the game's scoreline grid, the corners and
 * shots candidates from the lines SportyBet lists (board-pick.ts), each with
 * SportyBet's chance and price where it carries the line.
 */

/** The goals-side candidates; every one a half line, so none can push. */
export const ENGINE_GOAL_MARKETS: readonly string[] = [
  "1x2:home", "1x2:away", "dc:home-draw", "dc:away-draw",
  "ou:over:1.5", "ou:over:2.5", "ou:over:3.5", "ou:under:1.5", "ou:under:2.5", "ou:under:3.5",
  "ah:home:-1.5", "ah:away:-1.5", "ah:home:+1.5", "ah:away:+1.5",
  "tg:home:over:0.5", "tg:away:over:0.5", "tg:home:over:1.5", "tg:away:over:1.5",
  "tg:home:under:1.5", "tg:away:under:1.5", "tg:home:under:2.5", "tg:away:under:2.5",
];

function boardPrice(market: string, markets: readonly RawMarket[] | undefined): number | null {
  const sel = markets?.length ? toSportyBet(market) : null;
  const odds = sel && markets ? priceOn(sel, markets) : undefined;
  return odds !== undefined && odds > 1 ? odds : null;
}

export function engineCandidates(p: Prediction, markets: readonly RawMarket[] | undefined, lines: readonly ListedLine[]): EngineCandidate[] {
  const goals = gridFor(p);
  const out: EngineCandidate[] = [];
  for (const market of ENGINE_GOAL_MARKETS) {
    const probability = priceLeg(market, { goals })?.survive;
    if (probability === undefined) continue;
    out.push({ market, probability, marketChance: markets?.length ? fairChanceOn(market, markets) : null, price: boardPrice(market, markets) });
  }
  for (const l of lines) out.push({ market: l.market, probability: l.probability, marketChance: l.marketChance, price: l.price });
  return out;
}

/** The engine's headline and best pick per group on this game; onBoard when SportyBet's board for it was read. */
export function engineRead(p: Prediction, markets: readonly RawMarket[] | undefined, lines: readonly ListedLine[], onBoard: boolean): EngineRead {
  const cands = engineCandidates(p, markets, lines);
  const opts = { onBoard: onBoard && Boolean(markets?.length) };
  const label = (c: EngineChoice): EnginePick => ({
    ...c,
    probability: round4(c.probability),
    calibrated: round4(c.calibrated),
    score: round4(c.score),
    loadPrice: Math.round(c.loadPrice * 100) / 100,
    label: friendlyLabel(c.market, p.match.home.name, p.match.away.name, c.market),
    group: groupOf(c.family),
  });
  const headline = chooseHeadline(cands, opts);
  return { headline: headline ? label(headline) : null, groups: groupPicks(cands, opts).map(label) };
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

const PICK_GROUP: Record<string, Pick["group"]> = {
  result: "Match Result",
  "double-chance": "Double Chance",
  handicap: "Asian Handicap",
};

/** An engine pick in the shape every list and card takes, stated at its calibrated chance. */
export function engineAsPick(p: { model: Prediction["model"] }, e: EnginePick): Pick {
  return {
    market: e.market,
    label: e.label,
    group: PICK_GROUP[e.family] ?? (e.group === "corners" ? "Corners" : e.group === "shots" ? "Shots" : "Goals"),
    probability: e.calibrated,
    fairOdds: fairOdds(e.calibrated),
    confidence: confidenceFor(e.calibrated, p.model.dataQuality, p.model.uncertainty),
  };
}

/**
 * The engine's headline as the prediction's top pick, for when it publishes
 * (app_switches.headline_engine). Stated at its calibrated chance, the one
 * the lab found honest.
 */
export function withEngineHeadline(p: Prediction): Prediction {
  const e = p.engine?.headline;
  if (!e || !p.topPick) return p;
  const pick = engineAsPick(p, e);
  return { ...p, topPick: pick, picks: [pick, ...p.picks.filter((x) => x.market !== pick.market)], sweetSpot: false, marketCheck: undefined };
}
