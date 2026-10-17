import type { Pick, Prediction } from "@/lib/model/predict";
import type { MarketProbabilities } from "@/lib/model/poisson";
import { isStrong } from "@/lib/model/tiers";
import { isProLeague } from "@/lib/pro-leagues";

/**
 * What each viewer may see.
 *
 * The site (October 2026, second pass): every pick and every market on every
 * match is open to everyone. Picks are not a paid feature: gating them drove
 * people away. Pro adds the extras that were Pro before the experiment:
 * Asian handicap lines and the half-time / second-half markets
 * (`viewPrediction`).
 *
 * Ask KiqStat keeps the stricter tool view it had during the experiment
 * (`toolView`): on the free plan its answers cover the match result market
 * and today's free picks; Pro opens the rest. Forge keeps its own market rule
 * (forge.ts marketsForPlan).
 *
 * Pro leagues (October 2026, lib/pro-leagues.ts): on the 15 competitions
 * where the model reads best, a free viewer sees the win/draw/loss split
 * but not the pick or any other market until kick-off, unless the match is
 * one of today's free picks (`proLeagueLocked`). Every graded result stays
 * public on the track record.
 *
 * Pure, so the rules are tested once and every surface applies the same one.
 * Redaction happens on the server: a locked value never reaches a free
 * viewer's browser.
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
  /** The one Strong pick open to free viewers today, by match id. */
  freeStrongId: string | null;
  /** Match ids of today's free picks, the Strong one included. */
  freeIds: readonly string[];
}

export const PAID_VIEWER: Viewer = { paid: true, freeStrongId: null, freeIds: [] };

export function isPaidTier(tier: string): boolean {
  return tier === "pass" || tier === "pro" || tier === "vip";
}

/** True for a pick lockPick() produced: its selection never reached this side. */
export function isLockedPick(pick: { market: string } | null | undefined): boolean {
  return pick?.market === "locked";
}

/** Can this viewer see this match's headline pick? */
export function pickVisible(pick: Pick | null | undefined, matchId: string, viewer: Viewer, leagueCode: string | null | undefined): boolean {
  if (!pick || viewer.paid) return true;
  if (matchId === viewer.freeStrongId || viewer.freeIds.includes(matchId)) return true;
  if (isStrong(pick, leagueCode)) return false;
  return isFreeMarket(pick.market);
}

/**
 * A locked pick as it reaches the browser: the market group stays (so the
 * card can say "Pro pick · Goals"), the selection and its numbers do not.
 * Confidence is kept only as whether it is Strong, which the badge shows.
 */
export function lockPick(pick: Pick, leagueCode: string | null | undefined): Pick {
  return {
    market: "locked",
    label: "",
    group: pick.group,
    probability: 0,
    fairOdds: 0,
    confidence: isStrong(pick, leagueCode) ? 100 : 0,
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
  /** proLeague: locked because the match is in a Pro league before kick-off. */
  locked: { pick: boolean; markets: boolean; proLeague?: boolean };
}

/**
 * Is this match a Pro-league game a free viewer may not read yet? True
 * before kick-off in a Pro league, unless it is one of today's free picks.
 */
export function proLeagueLocked(
  match: { id: string; kickoff: string; league?: { code?: string | null } },
  viewer: Viewer,
  now = Date.now(),
): boolean {
  if (viewer.paid || !isProLeague(match.league?.code)) return false;
  if (Date.parse(match.kickoff) <= now) return false;
  return match.id !== viewer.freeStrongId && !viewer.freeIds.includes(match.id);
}

/**
 * Picks a free audience may be told about now, and how many Pro-league
 * picks were held back: for the messages that go to everyone at once (the
 * WhatsApp digest, the morning push to free devices).
 */
export function splitForFree<T extends { id: string; kickoff: string; league: { code?: string | null } }>(
  picks: readonly T[],
  viewer: Viewer,
  now = Date.now(),
): { open: T[]; proHeld: number } {
  const open = picks.filter((p) => !proLeagueLocked({ id: p.id, kickoff: p.kickoff, league: p.league }, viewer, now));
  return { open, proHeld: picks.length - open.length };
}

/** A Pro-league match as a free viewer gets it before kick-off: the 1X2 split and nothing else. */
function proLeagueView(p: Prediction): ViewedPrediction {
  const { halves: _halves, ...markets } = p.markets;
  void _halves;
  return {
    ...p,
    markets: lockMarkets(markets),
    asianHandicap: [],
    picks: [],
    topPick: p.topPick ? lockPick(p.topPick, p.match.league.code) : null,
    locked: { pick: true, markets: true, proLeague: true },
  };
}

/**
 * The site's view: everything for everyone, except the Pro extras (Asian
 * handicap and the half-by-half markets), stripped for a free viewer.
 */
export function viewPrediction(p: Prediction, viewer: Viewer, now = Date.now()): ViewedPrediction {
  if (viewer.paid) return { ...p, locked: { pick: false, markets: false } };
  if (proLeagueLocked(p.match, viewer, now)) return proLeagueView(p);
  const { halves: _halves, ...markets } = p.markets;
  void _halves;
  return { ...p, markets, asianHandicap: [], locked: { pick: false, markets: false } };
}

/**
 * Ask KiqStat's view for a free account: the 1X2 split and 1X2 picks, and the
 * headline pick only when it is 1X2 or one of today's free picks.
 */
export function toolView(p: Prediction, viewer: Viewer, now = Date.now()): ViewedPrediction {
  if (viewer.paid) return { ...p, locked: { pick: false, markets: false } };
  if (proLeagueLocked(p.match, viewer, now)) return proLeagueView(p);
  const pickOpen = pickVisible(p.topPick, p.match.id, viewer, p.match.league.code);
  const freePick = p.match.id === viewer.freeStrongId || viewer.freeIds.includes(p.match.id);
  return {
    ...p,
    markets: lockMarkets(p.markets),
    asianHandicap: [],
    picks: p.picks.filter((x) => isFreeMarket(x.market) || (freePick && x.market === p.topPick?.market)),
    topPick: p.topPick ? (pickOpen ? p.topPick : lockPick(p.topPick, p.match.league.code)) : null,
    locked: { pick: !pickOpen, markets: true },
  };
}
