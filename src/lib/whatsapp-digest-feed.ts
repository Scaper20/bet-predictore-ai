import "server-only";

import { upcomingFeed, predictBatch } from "@/lib/service";
import { shortlist } from "@/lib/featured";
import { toPersonalizedPick, type PersonalizedPick } from "@/lib/for-you";
import { priceSelections } from "@/lib/odds";
import { DEFAULT_SPORT } from "@/lib/sports";
import {
  buildDigestFromPicks,
  digestEligible,
  digestPick,
  DIGEST_MAX_SINGLES,
  DIGEST_MIN_ODDS,
  type DailyDigest,
} from "@/lib/whatsapp-digest";

/**
 * The I/O half of the WhatsApp digest — content rules and formatting live
 * in whatsapp-digest.ts (pure, tested directly).
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * SportyBet can price a selection a tick or two under our fair odds; past this
 * it is paying too little to post, whatever the model thinks.
 */
const MIN_BOOK_PRICE = DIGEST_MIN_ODDS - 0.05;

/**
 * The next 24 hours' picks, strongest first, capped at DIGEST_MAX_SINGLES,
 * then returned in kickoff order.
 *
 * A rolling 24 hours rather than the Lagos calendar day: the cron runs early
 * morning, and a day-boundary cut dropped every late kickoff (South America,
 * MLS, the NBA later) that a reader can still bet before bed.
 */
export async function todaysQualifyingPicks(now = new Date()): Promise<PersonalizedPick[]> {
  const from = now.getTime();
  const { matches } = await upcomingFeed(2);
  const window = matches.filter((m) => {
    const t = Date.parse(m.kickoff);
    return m.status === "scheduled" && t >= from && t < from + WINDOW_MS;
  });
  if (window.length === 0) return [];

  const candidates = shortlist(window, from, { maxMatches: 60, maxLeagues: 20 });
  const predictions = await predictBatch(candidates, candidates.length);

  const chosen = predictions
    .filter(digestEligible)
    .map((p) => ({ p, pick: digestPick(p) }))
    .filter((x): x is { p: (typeof predictions)[number]; pick: NonNullable<ReturnType<typeof digestPick>> } => x.pick !== null)
    .sort((a, b) => b.pick.confidence - a.pick.confidence)
    .slice(0, DIGEST_MAX_SINGLES + 4);

  // Real prices for what made the cut. Both sources are fetched a competition
  // at a time behind a cache, so this costs a handful of requests, not one per
  // pick; a failed lookup just means the pick is quoted at fair odds.
  const priced: (PersonalizedPick | null)[] = await Promise.all(
    chosen.map(async ({ p, pick }): Promise<PersonalizedPick | null> => {
      const [quote] = await priceSelections(p.match, [pick]).catch(() => []);
      const personal = toPersonalizedPick(p, DEFAULT_SPORT, pick);
      return personal ? { ...personal, bookPrice: quote?.local ?? null } : null;
    }),
  );

  return priced
    .filter((p): p is PersonalizedPick => p !== null)
    .filter((p) => !p.bookPrice || p.bookPrice >= MIN_BOOK_PRICE)
    .slice(0, DIGEST_MAX_SINGLES)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

export async function buildDailyDigest(now = new Date()): Promise<DailyDigest> {
  const picks = await todaysQualifyingPicks(now);
  return buildDigestFromPicks(picks);
}
