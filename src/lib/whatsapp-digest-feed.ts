import "server-only";

import { upcomingFeed, predictBatch } from "@/lib/service";
import { shortlist } from "@/lib/featured";
import { toPersonalizedPick, type PersonalizedPick } from "@/lib/for-you";
import { APP_TIMEZONE } from "@/lib/format";
import { DEFAULT_SPORT } from "@/lib/sports";
import { buildDigestFromPicks, type DailyDigest } from "@/lib/whatsapp-digest";

/**
 * The I/O half of the WhatsApp digest — content rules and formatting live
 * in whatsapp-digest.ts (pure, tested directly).
 */

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

/** Today's publishable picks, Africa/Lagos calendar day, chronological. */
export async function todaysQualifyingPicks(now = new Date()): Promise<PersonalizedPick[]> {
  const today = dayKey(now.toISOString());
  // 2 days, not 1: a match kicking off just after midnight WAT can still be
  // "today" by the real Lagos-local day even though upcomingFeed's window
  // is UTC-relative — asking for one extra day and filtering below is
  // cheaper than risking a missed late fixture.
  const { matches } = await upcomingFeed(2);
  const todays = matches.filter((m) => dayKey(m.kickoff) === today);
  if (todays.length === 0) return [];

  const candidates = shortlist(todays, now.getTime(), { maxMatches: 30, maxLeagues: 10 });
  const predictions = await predictBatch(candidates, candidates.length);

  return predictions
    .filter((p) => p.sufficiency.publishable && p.topPick)
    .map((p) => toPersonalizedPick(p, DEFAULT_SPORT))
    .filter((p): p is PersonalizedPick => p !== null)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

export async function buildDailyDigest(now = new Date()): Promise<DailyDigest> {
  const picks = await todaysQualifyingPicks(now);
  return buildDigestFromPicks(picks);
}
