import "server-only";

import { getPreferences } from "@/lib/preferences";
import { getEntitlement, type Entitlement } from "@/lib/entitlements";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { upcomingFeed, predictBatch, bestBetOfDay, featuredFeed } from "@/lib/service";
import { supabaseServer } from "@/lib/supabase/server";
import { settledRecords } from "@/lib/performance-store";
import { EMPTY_RECORD, isPublishable } from "@/lib/performance";
import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import type { Prediction } from "@/lib/model/predict";
import type { Match } from "@/lib/types";
import {
  buildAcca,
  inFollowedLeagues,
  toPersonalizedPick,
  type ForYouFeedPayload,
  type LeagueRecordRow,
  type PersonalizedPick,
} from "@/lib/for-you";

/**
 * Assembles the For You page. Selection rules and shapes live in for-you.ts;
 * this module is the I/O.
 */

/** How far ahead to look inside a followed competition. */
const HORIZON_DAYS = 5;

/** Ceiling on fixtures sent for prediction, after league scoping. */
const PREDICT_LIMIT = 18;

/** What someone who has not answered onboarding sees. */
const DEFAULT_LEAGUE_CODES = ["premier-league", "champions-league", "npfl"];

async function resolveDisplayName(entitlement: Entitlement): Promise<string | null> {
  if (!entitlement.signedIn) return null;

  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      const name = profile?.display_name?.trim();
      if (name) return name;
    }
  } catch {
    // Fall through to the email handle.
  }

  return entitlement.email?.split("@")[0] ?? null;
}

/**
 * Fixtures inside the followed competitions.
 *
 * One provider call per followed league rather than one open call filtered
 * afterwards. getUpcoming(days, code) hard-filters by code AND adds
 * league-specific endpoints that reach further ahead than the day scan, so
 * this returns MORE of what the user asked for — not merely less of what they
 * didn't. It also means the PREDICT_LIMIT below applies to already-scoped
 * fixtures; the old code truncated the unfiltered feed first, so a followed
 * fixture sitting past position 24 was never predicted at all.
 *
 * Bounded by the followed-league count, and every call goes through the shared
 * provider TTL cache, so a popular league is fetched once for everyone.
 */
async function fixturesInLeagues(codes: string[]): Promise<Match[]> {
  const feeds = await Promise.all(
    codes.map((code) => upcomingFeed(HORIZON_DAYS, code).catch(() => null)),
  );

  const seen = new Set<string>();
  const matches: Match[] = [];
  for (const feed of feeds) {
    if (!feed) continue;
    for (const match of feed.matches) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      matches.push(match);
    }
  }

  return matches.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

export async function getForYouFeed(sport: SportId = DEFAULT_SPORT): Promise<ForYouFeedPayload> {
  const [entitlement, prefs] = await Promise.all([getEntitlement(), getPreferences()]);
  const userName = await resolveDisplayName(entitlement);

  const usingDefaults = prefs.leagues.length === 0;
  const codes = usingDefaults ? DEFAULT_LEAGUE_CODES : prefs.leagues;
  const followedLeagues = codes
    .map((code) => leagueByCode(code))
    .filter((l): l is LeagueDef => l !== undefined);
  const followed = new Set(followedLeagues.map((l) => l.code));

  const [scoped, bestBetPrediction, featured, records] = await Promise.all([
    fixturesInLeagues([...followed]).catch(() => [] as Match[]),
    bestBetOfDay().catch(() => null),
    featuredFeed(4).catch(() => []),
    settledRecords({ sport, sinceDays: 30 }).catch(() => null),
  ]);

  const predictions = scoped.length
    ? await predictBatch(scoped, PREDICT_LIMIT).catch(() => [] as Prediction[])
    : [];

  const projected = predictions
    // The same publishable gate the predictions page applies — a fixture whose
    // competition has too little history produces no pick anywhere on the site.
    .filter((p) => p.sufficiency.publishable && p.topPick)
    .map((p) => toPersonalizedPick(p, sport))
    .filter((p): p is PersonalizedPick => p !== null);

  // Belt and braces over the scoped fetch: if a provider ever returns a
  // fixture outside the requested competition, it still cannot reach the
  // personalised zone.
  const inYourLeagues = inFollowedLeagues(projected, followed);

  const bestBet = bestBetPrediction ? toPersonalizedPick(bestBetPrediction, sport) : null;

  const quickPicks = featured
    .map((f) => toPersonalizedPick(f.prediction, sport))
    .filter((p): p is PersonalizedPick => p !== null)
    // The pick of the day is shown in full above; no need to repeat it.
    .filter((p) => p.id !== bestBet?.id)
    .slice(0, 3);

  const leagueRecords: LeagueRecordRow[] = followedLeagues.map((league) => {
    // settledRecords keys on the league DISPLAY NAME, because that is what
    // settlement-runner.ts writes. Looking up by code silently returns nothing.
    const record = records?.byLeague.get(league.name);
    return {
      league,
      record: record ?? EMPTY_RECORD,
      publishable: isPublishable(record),
    };
  });

  return {
    userName,
    userEmail: entitlement.email,
    signedIn: entitlement.signedIn,
    tier: entitlement.tier,
    sport,
    preferences: prefs,
    followedLeagues,
    usingDefaults,
    inYourLeagues,
    acca: buildAcca(inYourLeagues),
    leagueRecords,
    bestBet,
    quickPicks,
    updatedAt: new Date().toISOString(),
  };
}
