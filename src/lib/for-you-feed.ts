import "server-only";

import { getPreferences } from "@/lib/preferences";
import { getEntitlement, type Entitlement } from "@/lib/entitlements";
import { leagueByCode, type LeagueDef } from "@/lib/leagues";
import { upcomingFeed, predictBatch, bestBetOfDay, featuredFeed } from "@/lib/service";
import { viewerForTier } from "@/lib/viewer";
import { isLockedPick, viewPrediction } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_SPORT, type SportId } from "@/lib/sports";
import type { Prediction } from "@/lib/model/predict";
import type { Match } from "@/lib/types";
import {
  buildAcca,
  inFollowedLeagues,
  toPersonalizedPick,
  type ForYouFeedPayload,
  type PersonalizedPick,
} from "@/lib/for-you";

/**
 * Assembles the For You page. Selection rules and shapes live in for-you.ts;
 * this module is the I/O.
 */

/**
 * How far ahead to look inside a followed competition.
 *
 * Wider than the predictions page's 5 because this feed is narrow by design:
 * scoped to a handful of competitions, a short window lands on an empty page
 * through most of an international break. The scoped provider call costs the
 * same either way — it is one league endpoint per competition regardless of
 * the horizon — so the extra days are free.
 */
const HORIZON_DAYS = 7;

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

  const [scoped, bestBetPrediction, featured] = await Promise.all([
    fixturesInLeagues([...followed]).catch(() => [] as Match[]),
    bestBetOfDay().catch(() => null),
    featuredFeed(4).catch(() => []),
  ]);

  const [predictions, viewer] = await Promise.all([
    scoped.length ? predictBatch(scoped, PREDICT_LIMIT).catch(() => [] as Prediction[]) : Promise.resolve([] as Prediction[]),
    viewerForTier(entitlement.tier),
  ]);
  // Free viewers: non-1X2 and Strong picks (but one) arrive locked, stripped
  // here before the feed is sent to the browser (lib/access.ts).
  const view = (p: Prediction) => toPersonalizedPick(viewPrediction(p, viewer), sport);

  const projected = predictions
    // The same publishable gate the predictions page applies — a fixture whose
    // competition has too little history produces no pick anywhere on the site.
    .filter((p) => p.sufficiency.publishable && p.topPick)
    .map(view)
    .filter((p): p is PersonalizedPick => p !== null);

  // Belt and braces over the scoped fetch: if a provider ever returns a
  // fixture outside the requested competition, it still cannot reach the
  // personalised zone.
  const inYourLeagues = inFollowedLeagues(projected, followed);

  const bestBet = bestBetPrediction ? view(bestBetPrediction) : null;

  const quickPicks = featured
    .map((f) => view(f.prediction))
    .filter((p): p is PersonalizedPick => p !== null)
    // The pick of the day is shown in full above; no need to repeat it.
    .filter((p) => p.id !== bestBet?.id)
    .slice(0, 3);

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
    // Built from the picks this viewer can see, so a free multiple is usable.
    acca: buildAcca(inYourLeagues.filter((p) => !isLockedPick(p))),
    bestBet,
    quickPicks,
    updatedAt: new Date().toISOString(),
  };
}
