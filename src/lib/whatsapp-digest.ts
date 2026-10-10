import { odds, percent, kickoffTime } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import type { PersonalizedPick } from "@/lib/for-you";
import { headlineEligible, type Pick, type Prediction } from "@/lib/model/predict";
import { isStrong } from "@/lib/model/tiers";

/* ------------------------------------------------------------ Selection */

/**
 * The shortest price a digest single may carry.
 *
 * The site's headline pick is tuned to land as often as possible and
 * averages 1.32; posted to a betting community that reads as not worth the
 * stake. Walk-forward over two seasons of the top five leagues, the best pick
 * at fair odds of 1.40 or longer landed 63-64% of the time at an average of
 * 1.55. Raising the floor further buys price with win rate and no extra
 * return: at bookmaker prices every floor tested (1.40-1.60) lost a few
 * percent to the margin, so this is about picks worth posting, not a promise
 * of profit — and the message never claims "value".
 */
export const DIGEST_MIN_ODDS = 1.4;
/** Below this the selection is a long shot, not a pick. */
const DIGEST_MIN_PROBABILITY = 0.4;
export const DIGEST_MAX_SINGLES = 8;
/** Uncatalogued competitions need real depth before they reach the community. */
export const UNCATALOGUED_MIN_MATCHES = 100;

const YOUTH_OR_RESERVE = /\b(u-?1[5-9]|u-?2[0-3]|under[- ]?(1[5-9]|2[0-3])|youth|junior|reserves?|ii|b team|academy|primavera)\b/i;

/** Youth, reserve and academy competitions: thin, volatile, rarely bettable. */
export function isYouthOrReserve(competition: string): boolean {
  return YOUTH_OR_RESERVE.test(competition);
}

/** Whether a fixture belongs in the community digest at all. */
export function digestEligible(p: Prediction): boolean {
  if (!p.sufficiency.publishable) return false;
  if (isYouthOrReserve(p.match.league.name)) return false;
  return Boolean(p.match.league.code) || p.model.matchesUsed >= UNCATALOGUED_MIN_MATCHES;
}

/**
 * The digest's pick for a fixture: the highest-ranked selection the headline
 * rule would allow, priced at DIGEST_MIN_ODDS or longer. prediction.picks is
 * already ordered by that rule, so this is the first one past the floor.
 */
export function digestPick(p: Prediction): Pick | null {
  return (
    p.picks.find(
      (x) => headlineEligible(x) && x.fairOdds >= DIGEST_MIN_ODDS && x.probability >= DIGEST_MIN_PROBABILITY,
    ) ?? null
  );
}

/** The price to quote: SportyBet's where we have it, otherwise our fair odds. */
export function quotedPrice(p: PersonalizedPick): { price: number; source: "SportyBet" | "fair" } {
  return p.bookPrice && p.bookPrice > 1
    ? { price: p.bookPrice, source: "SportyBet" }
    : { price: p.fairOdds, source: "fair" };
}

/**
 * The WhatsApp community broadcast — see the design artifact for the
 * product shape. Pure: content rules and message formatting only, no I/O —
 * the fetching lives in whatsapp-digest-feed.ts, same settlement.ts /
 * settlement-runner.ts split already used in this codebase, because
 * `import "server-only"` throws under vitest and these rules need tests.
 *
 * Computed once a day rather than per-match: an accumulator needs its
 * whole slate visible before the earliest leg locks in, so revealing picks
 * hour-by-hour as each match approaches doesn't actually work for accas.
 *
 * Every message here is built ONLY from picks that already cleared
 * sufficiency.publishable upstream — same honesty gate as the rest of the
 * product (bestBetOfDay, the homepage board). An acca tier that can't reach
 * its target odds from real legs is omitted, never padded.
 */

export interface DigestAccaLeg {
  fixture: string;
  league: string;
  selection: string;
  fairOdds: number;
  bookPrice: number | null;
}

export interface DigestAcca {
  tier: "safe" | "balanced" | "risky";
  label: string;
  legs: DigestAccaLeg[];
  combinedFairOdds: number;
  /** Product of SportyBet prices, only when every leg has one. */
  combinedBookPrice: number | null;
}

const TIERS: { tier: DigestAcca["tier"]; label: string; targetOdds: number }[] = [
  { tier: "safe", label: "Safe", targetOdds: 2 },
  { tier: "balanced", label: "Balanced", targetOdds: 5 },
  { tier: "risky", label: "Risky", targetOdds: 10 },
];

/**
 * Walks the day's picks, highest-confidence first, adding one leg at a time
 * until each tier's target combined price is reached (or the picks run
 * out). A tier whose legs are identical to the previous tier's — a quiet
 * day with only 2-3 qualifying picks total, where "safe" and "risky" would
 * otherwise be the exact same combo under two different names — is
 * dropped rather than repeated.
 *
 * Combining by multiplying probabilities treats legs as independent, which
 * is an assumption, not a fact, same caveat src/lib/for-you.ts's buildAcca
 * already states for the personalized feed's version of this same math.
 */
export function buildAccaTiers(picks: PersonalizedPick[]): DigestAcca[] {
  const sorted = [...picks].sort((a, b) => b.confidence - a.confidence);
  const tiers: DigestAcca[] = [];
  let lastKey: string | null = null;

  for (const { tier, label, targetOdds } of TIERS) {
    let legs = sorted.slice(0, Math.min(2, sorted.length));
    for (let n = 2; n <= sorted.length; n++) {
      const subset = sorted.slice(0, n);
      const combinedProbability = subset.reduce((acc, p) => acc * p.probability, 1);
      legs = subset;
      if (combinedProbability > 0 && 1 / combinedProbability >= targetOdds) break;
    }
    if (legs.length < 2) continue;

    const key = legs.map((l) => l.id).join(",");
    if (key === lastKey) continue;
    lastKey = key;

    const combinedProbability = legs.reduce((acc, p) => acc * p.probability, 1);
    const allPriced = legs.every((l) => l.bookPrice && l.bookPrice > 1);
    tiers.push({
      tier,
      label,
      legs: legs.map((p) => ({
        fixture: `${p.homeTeam} vs ${p.awayTeam}`,
        league: p.league.shortName,
        selection: p.label,
        fairOdds: p.fairOdds,
        bookPrice: p.bookPrice ?? null,
      })),
      combinedFairOdds: combinedProbability > 0 ? 1 / combinedProbability : 0,
      combinedBookPrice: allPriced ? legs.reduce((acc, l) => acc * (l.bookPrice as number), 1) : null,
    });
  }

  return tiers;
}

/* -------------------------------------------------------------- Messages */

export interface DailyDigest {
  hasPicks: boolean;
  picksMessage: string;
  accaMessages: string[];
}

const MAX_PICKS_SHOWN = DIGEST_MAX_SINGLES;

export function formatPicksMessage(picks: PersonalizedPick[]): string {
  const shown = picks.slice(0, MAX_PICKS_SHOWN);
  const lines = shown.map((p) => {
    const q = quotedPrice(p);
    return (
      `${isStrong(p) ? "⭐ STRONG PICK · " : "⚽ "}${p.league.shortName}\n` +
      `${p.homeTeam} vs ${p.awayTeam} — ${kickoffTime(p.kickoff)}\n` +
      `*${p.label}* @${odds(q.price)}${q.source === "SportyBet" ? " on SportyBet" : " (est.)"}\n` +
      `${percent(p.probability)} chance · based on ${p.matchesUsed} matches`
    );
  });

  const overflow = picks.length - shown.length;
  const header = `*KiqStat — Today's Picks*\n${shown.length} pick${shown.length === 1 ? "" : "s"} for the next 24 hours, all at odds of ${odds(DIGEST_MIN_ODDS)} or longer.`;
  const footer =
    overflow > 0 ? `+${overflow} more at ${SITE_URL}/football/predictions` : `${SITE_URL}/football/predictions`;

  return [header, ...lines, footer].join("\n\n");
}

export function formatAccaMessage(acca: DigestAcca): string {
  const legLines = acca.legs.map(
    (l, i) => `${i + 1}. ${l.fixture} (${l.league}) — *${l.selection}*${l.bookPrice ? ` @${odds(l.bookPrice)}` : ""}`,
  );
  const headline = acca.combinedBookPrice
    ? `*${acca.label} acca — @${odds(acca.combinedBookPrice)} on SportyBet*`
    : `*${acca.label} acca — @${odds(acca.combinedFairOdds)} (est.)*`;
  return [
    headline,
    ...legLines,
    `Lands about 1 time in ${Math.max(1, Math.round(acca.combinedFairOdds))}. Probabilities, not promises. 18+.`,
  ].join("\n\n");
}

export const NO_PICK_MESSAGE = [
  "*KiqStat — Today's Picks*",
  "Nothing in the next 24 hours clears our bar — enough history, odds of 1.40 or longer. We'd rather send nothing than guess.",
  `Live scores anyway → ${SITE_URL}`,
].join("\n\n");

/** The full day's digest, ready to paste — or a single no-pick message. */
export function buildDigestFromPicks(picks: PersonalizedPick[]): DailyDigest {
  if (picks.length === 0) {
    return { hasPicks: false, picksMessage: NO_PICK_MESSAGE, accaMessages: [] };
  }

  const tiers = buildAccaTiers(picks);
  return {
    hasPicks: true,
    picksMessage: formatPicksMessage(picks),
    accaMessages: tiers.map(formatAccaMessage),
  };
}
