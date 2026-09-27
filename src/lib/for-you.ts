import { leagueByCode, type LeagueDef } from "@/lib/leagues";
// Type-only, so no `server-only` module is pulled into the runtime graph —
// these erase at compile time and never reach the test environment.
import type { UserPreferences } from "@/lib/preferences";
import type { Entitlement } from "@/lib/entitlements";
import type { SettledRecord } from "@/lib/performance";
import type { SportId } from "@/lib/sports";
import type { Prediction } from "@/lib/model/predict";
import type { Match } from "@/lib/types";

/**
 * The personalised feed: shapes and selection rules.
 *
 * Pure — the fetching lives in for-you-feed.ts, matching the
 * settlement.ts / settlement-runner.ts split already used here, because
 * `import "server-only"` throws under vitest and these rules need tests.
 *
 * Two rules define this module, and both exist because the previous version
 * broke them:
 *
 * 1. NOTHING here is invented. Every number rendered on the For You page
 *    traces to either the fitted model or a settled row in predictions_log.
 *    The old version derived a "bookmaker price" from the confidence score's
 *    remainder and an "EV edge" floored at +8% — figures a user would act on
 *    financially, computed from nothing. There is no odds feed in this
 *    product, so there is no EV to show, and the honest surface is the fair
 *    price plus the sample size behind it.
 *
 * 2. The personalised zone is STRICTLY within the user's followed leagues,
 *    structurally rather than by a filter that can fall through. The old
 *    version ended with `userLeaguePicks.length > 0 ? userLeaguePicks : rawPicks`
 *    — so an EPL follower with a quiet week silently got the entire unfiltered
 *    slate, under a heading that still said "customized for your followed
 *    leagues". Slate-wide content now lives in its own fields and is labelled
 *    as slate-wide in the UI.
 */

/** Legs in a suggested accumulator, and the minimum worth showing. */
export const ACCA_LEGS = 3;
export const ACCA_MIN_LEGS = 2;

export interface PersonalizedPick {
  id: string;
  href: string;
  homeTeam: string;
  awayTeam: string;
  league: { code: string | null; name: string; shortName: string; flag?: string };
  kickoff: string;
  status: Match["status"];
  market: string;
  group: string;
  label: string;
  probability: number;
  /** The model's own break-even price. There is no bookmaker price to show. */
  fairOdds: number;
  confidence: number;
  /** Real evidence behind the pick, straight off the fitted model. */
  matchesUsed: number;
  dataQuality: number;
}

export interface AccaLeg {
  matchId: string;
  href: string;
  fixture: string;
  league: string;
  kickoff: string;
  market: string;
  group: string;
  selection: string;
  probability: number;
  fairOdds: number;
}

export interface AccaSuggestion {
  legs: AccaLeg[];
  /** Product of the legs' probabilities, treating them as independent. */
  combinedProbability: number;
  /** The break-even price for that combined probability. */
  combinedFairOdds: number;
}

export interface LeagueRecordRow {
  league: LeagueDef;
  record: SettledRecord;
  /** False when the sample is too thin to quote a rate — show a note instead. */
  publishable: boolean;
}

export interface ForYouFeedPayload {
  userName: string | null;
  userEmail: string | null;
  signedIn: boolean;
  tier: Entitlement["tier"];
  sport: SportId;
  preferences: UserPreferences;
  followedLeagues: LeagueDef[];
  /** True when these are our defaults, not the user's answers. */
  usingDefaults: boolean;

  /** STRICTLY inside followedLeagues. Empty is a valid, rendered answer. */
  inYourLeagues: PersonalizedPick[];
  /** Null when fewer than ACCA_MIN_LEGS are available in those leagues. */
  acca: AccaSuggestion | null;
  /** Settled record per followed league. Real, or flagged unpublishable. */
  leagueRecords: LeagueRecordRow[];

  /** Slate-wide. Labelled as such in the UI — the brief's explicit carve-out. */
  bestBet: PersonalizedPick | null;
  quickPicks: PersonalizedPick[];

  updatedAt: string;
}

/**
 * Structural guarantee that rule 2 above holds.
 *
 * Typed on the minimal shape so it can be unit-tested without constructing a
 * whole Prediction. An empty result is the correct answer for a quiet week —
 * callers render an empty state, they do not widen the net.
 */
export function inFollowedLeagues<T extends { league: { code: string | null } }>(
  picks: T[],
  followed: ReadonlySet<string>,
): T[] {
  return picks.filter((p) => p.league.code !== null && followed.has(p.league.code));
}

/** Prediction → the projection that crosses to the client. */
export function toPersonalizedPick(prediction: Prediction, sport: SportId): PersonalizedPick | null {
  const pick = prediction.topPick;
  if (!pick) return null;

  const { match, model } = prediction;
  const def = match.league.code ? leagueByCode(match.league.code) : undefined;

  return {
    id: match.id,
    href: `/${sport}/match/${encodeURIComponent(match.id)}`,
    homeTeam: match.home.name,
    awayTeam: match.away.name,
    league: {
      code: match.league.code ?? null,
      name: def?.name ?? match.league.name,
      shortName: def?.shortName ?? match.league.name,
      flag: def?.flag,
    },
    kickoff: match.kickoff,
    status: match.status,
    market: pick.market,
    group: pick.group,
    label: pick.label,
    probability: pick.probability,
    fairOdds: pick.fairOdds,
    confidence: Math.round(pick.confidence),
    matchesUsed: model.matchesUsed,
    dataQuality: model.dataQuality,
  };
}

/**
 * Builds an accumulator from picks already scoped to the user's leagues.
 *
 * Pure, and it never pads: fewer than ACCA_MIN_LEGS returns null so the UI can
 * say why, rather than topping the slip up with fixtures from competitions the
 * user did not ask for — which is what the old fictional fallback legs
 * ("Real Madrid vs Barcelona") were papering over.
 */
export function buildAcca(picks: PersonalizedPick[]): AccaSuggestion | null {
  const legs = [...picks]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, ACCA_LEGS);

  if (legs.length < ACCA_MIN_LEGS) return null;

  // Independence is an assumption, not a fact — two fixtures in one
  // competition on one weekend are correlated. The UI states this next to the
  // number rather than presenting the product as an exact answer.
  const combinedProbability = legs.reduce((acc, leg) => acc * leg.probability, 1);

  return {
    legs: legs.map((p) => ({
      matchId: p.id,
      href: p.href,
      fixture: `${p.homeTeam} vs ${p.awayTeam}`,
      league: p.league.shortName,
      kickoff: p.kickoff,
      market: p.market,
      group: p.group,
      selection: p.label,
      probability: p.probability,
      fairOdds: p.fairOdds,
    })),
    combinedProbability,
    combinedFairOdds: combinedProbability > 0 ? 1 / combinedProbability : 0,
  };
}
