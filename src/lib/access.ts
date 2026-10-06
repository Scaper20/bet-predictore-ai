import type { Pick, Prediction } from "@/lib/model/predict";
import type { MarketProbabilities } from "@/lib/model/poisson";
import { isStrong } from "@/lib/model/tiers";

/**
 * What a free viewer may see (October 2026).
 *
 * Every match stays visible. On the free plan only the match-result (1X2)
 * market and 1X2 picks are open; every other market and pick is locked to
 * Pro, shown blurred with an upgrade prompt. Of the Strong picks, exactly
 * one is open to free viewers: `freeStrongId`, chosen once for everyone
 * (service.ts freeStrongPickId) so every page agrees which one it is.
 *
 * Pure, so the rule is tested once and every surface (pages, APIs, Ask
 * BetriX, Forge, push) applies the same one. Redaction happens on the
 * server: a locked value never reaches a free viewer's browser.
 */

export const FREE_MARKET_FAMILIES: ReadonlySet<string> = new Set(["1x2"]);

export function marketFamily(market: string): string {
  return market.split(":")[0];
}

export function isFreeMarket(market: string): boolean {
  return FREE_MARKET_FAMILIES.has(marketFamily(market));
}

export interface Viewer {
  /** Pro, VIP, or a pass still running. */
  paid: boolean;
  /** The one Strong pick open to free viewers right now, by match id. */
  freeStrongId: string | null;
}

export const PAID_VIEWER: Viewer = { paid: true, freeStrongId: null };

export function isPaidTier(tier: string): boolean {
  return tier === "pass" || tier === "pro" || tier === "vip";
}

/** True for a pick lockPick() produced: its selection never reached this side. */
export function isLockedPick(pick: { market: string } | null | undefined): boolean {
  return pick?.market === "locked";
}

/** Can this viewer see this match's headline pick? */
export function pickVisible(pick: Pick | null | undefined, matchId: string, viewer: Viewer): boolean {
  if (!pick || viewer.paid) return true;
  if (isStrong(pick)) return matchId === viewer.freeStrongId;
  return isFreeMarket(pick.market);
}

/**
 * A locked pick as it reaches the browser: the market group stays (so the
 * card can say "Pro pick · Goals"), the selection and its numbers do not.
 * Confidence is kept only as whether it is Strong, which the badge shows.
 */
export function lockPick(pick: Pick): Pick {
  return {
    market: "locked",
    label: "",
    group: pick.group,
    probability: 0,
    fairOdds: 0,
    confidence: isStrong(pick) ? 100 : 0,
  };
}

function lockMarkets(m: MarketProbabilities): MarketProbabilities {
  return {
    home: m.home,
    draw: m.draw,
    away: m.away,
    bttsYes: 0,
    bttsNo: 0,
    over: {},
    under: {},
    doubleChance: { homeOrDraw: 0, awayOrDraw: 0, homeOrAway: 0 },
    cleanSheet: { home: 0, away: 0 },
    correctScore: [],
    expectedGoals: { home: 0, away: 0, total: 0 },
  };
}

export interface ViewedPrediction extends Prediction {
  locked: { pick: boolean; markets: boolean };
}

/**
 * The prediction this viewer is allowed to receive: for a free viewer, the
 * 1X2 split and 1X2 picks only, and the headline pick locked unless it is
 * open to them.
 */
export function viewPrediction(p: Prediction, viewer: Viewer): ViewedPrediction {
  if (viewer.paid) return { ...p, locked: { pick: false, markets: false } };
  const pickOpen = pickVisible(p.topPick, p.match.id, viewer);
  const freeStrong = p.match.id === viewer.freeStrongId && p.topPick && isStrong(p.topPick);
  return {
    ...p,
    markets: lockMarkets(p.markets),
    asianHandicap: [],
    picks: p.picks.filter((x) => isFreeMarket(x.market) || (freeStrong && x.market === p.topPick?.market)),
    topPick: p.topPick ? (pickOpen ? p.topPick : lockPick(p.topPick)) : null,
    locked: { pick: !pickOpen, markets: true },
  };
}
