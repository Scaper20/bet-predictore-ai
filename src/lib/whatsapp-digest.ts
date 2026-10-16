import { odds, percent, kickoffTime } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import type { PersonalizedPick } from "@/lib/for-you";
import { headlineEligible, type Pick, type Prediction } from "@/lib/model/predict";
import { isStrong } from "@/lib/model/tiers";

/* ------------------------------------------------------------ Selection */

/**
 * The shortest price a digest single may carry.
 *
 * Was 1.40, which meant 77% of digest picks were a fixture's second or third
 * choice, reached for because the top read was shorter (replay,
 * scripts/decision-lab.ts). Live, those landed 65% and the goals ones 50%.
 * Replayed over 12 months, each day's top eight at 1.40 or longer landed
 * 71.0% at an average 1.50; at 1.30 or longer, 76.8% at 1.36, close to the
 * best read with no floor at all (77.6% at 1.32). The floor still keeps the
 * near-certainties (over 0.5 goals and the like) out.
 */
export const DIGEST_MIN_ODDS = 1.3;
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
  const main = p.picks.find(
    (x) => headlineEligible(x) && x.fairOdds >= DIGEST_MIN_ODDS && x.probability >= DIGEST_MIN_PROBABILITY,
  );
  if (main) return main;
  // Nothing else fits: a half-goal Asian handicap line the model rates 60-80%.
  return (
    p.picks
      .filter((x) => isHalfGoalHandicap(x.market) && x.probability >= 0.6 && x.probability <= 0.8 && x.fairOdds >= DIGEST_MIN_ODDS)
      .sort((a, b) => b.probability - a.probability)[0] ?? null
  );
}

function isHalfGoalHandicap(market: string): boolean {
  const [family, , line] = market.split(":");
  return family === "ah" && Math.abs((Number(line) * 2) % 2) === 1;
}

/** The price to quote: the local market's where we have it, otherwise our fair price. */
export function quotedPrice(p: PersonalizedPick): { price: number; source: "market" | "fair" } {
  return p.bookPrice && p.bookPrice > 1
    ? { price: p.bookPrice, source: "market" }
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

/**
 * Combos at 2, 3 and 5 odds, never more than six legs. Were 2, 5 and 10:
 * live, the 5- and 10-odds combos (up to seven legs) landed 1 of 22 times,
 * as their odds said they would, which reads as losing every day in a group.
 * Replayed, the 3- and 5-odds combos landed 36% and 27% of days.
 */
const TIERS: { tier: DigestAcca["tier"]; label: string; targetOdds: number }[] = [
  { tier: "safe", label: "Safe", targetOdds: 2 },
  { tier: "balanced", label: "Balanced", targetOdds: 3 },
  { tier: "risky", label: "Risky", targetOdds: 5 },
];
export const DIGEST_COMBO_MAX_LEGS = 6;

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
    let reached = false;
    for (let n = 2; n <= Math.min(sorted.length, DIGEST_COMBO_MAX_LEGS); n++) {
      const subset = sorted.slice(0, n);
      const combinedProbability = subset.reduce((acc, p) => acc * p.probability, 1);
      legs = subset;
      if (combinedProbability > 0 && 1 / combinedProbability >= targetOdds) {
        reached = true;
        break;
      }
    }
    if (legs.length < 2 || !reached) continue;

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

export function formatPicksMessage(picks: PersonalizedPick[], proHeld = 0): string {
  const shown = picks.slice(0, MAX_PICKS_SHOWN);
  const lines = shown.map((p) => {
    const q = quotedPrice(p);
    return (
      `${isStrong(p) ? "⭐ STRONG PICK · " : "⚽ "}${p.league.shortName}\n` +
      `${p.homeTeam} vs ${p.awayTeam} — ${kickoffTime(p.kickoff)}\n` +
      `*${p.label}* at ${odds(q.price)}${q.source === "market" ? " (market)" : " (est.)"}\n` +
      `${percent(p.probability)} chance · based on ${p.matchesUsed} matches`
    );
  });

  const overflow = picks.length - shown.length;
  const header = `*KiqStat — Today's Picks*\n${shown.length} pick${shown.length === 1 ? "" : "s"} for the next 24 hours, all at a price of ${odds(DIGEST_MIN_ODDS)} or longer.`;
  const footer =
    overflow > 0 ? `+${overflow} more at ${SITE_URL}/football/predictions` : `${SITE_URL}/football/predictions`;
  // Pro-league picks (lib/pro-leagues.ts) are held back from this public
  // message until kick-off; say how many, never which.
  const pro =
    proHeld > 0
      ? `🔒 +${proHeld} more pick${proHeld === 1 ? "" : "s"} today in Pro leagues (Champions League, Serie A, Bundesliga and more), for Pro members before kick-off → ${SITE_URL}/pricing`
      : null;

  return [header, ...lines, ...(pro ? [pro] : []), footer].join("\n\n");
}

export function formatAccaMessage(acca: DigestAcca): string {
  const legLines = acca.legs.map(
    (l, i) => `${i + 1}. ${l.fixture} (${l.league}) — *${l.selection}*${l.bookPrice ? ` at ${odds(l.bookPrice)}` : ""}`,
  );
  const headline = acca.combinedBookPrice
    ? `*${acca.label} combo — ${odds(acca.combinedBookPrice)} (market)*`
    : `*${acca.label} combo — ${odds(acca.combinedFairOdds)} (est.)*`;
  return [
    headline,
    ...legLines,
    `Lands about 1 time in ${Math.max(1, Math.round(acca.combinedFairOdds))}. Probabilities, not promises. 18+.`,
  ].join("\n\n");
}

export const NO_PICK_MESSAGE = [
  "*KiqStat — Today's Picks*",
  `Nothing in the next 24 hours clears our bar — enough history, a price of ${odds(DIGEST_MIN_ODDS)} or longer. We'd rather send nothing than guess.`,
  `Live scores anyway → ${SITE_URL}`,
].join("\n\n");

/** The full day's digest, ready to paste — or a single no-pick message. */
export function buildDigestFromPicks(picks: PersonalizedPick[], proHeld = 0): DailyDigest {
  if (picks.length === 0 && proHeld > 0) {
    return {
      hasPicks: true,
      picksMessage: [
        "*KiqStat — Today's Picks*",
        `All ${proHeld} of today's picks are in Pro leagues (Champions League, Serie A, Bundesliga and more). Pro members have them now; everyone sees them at kick-off.`,
        `${SITE_URL}/pricing`,
      ].join("\n\n"),
      accaMessages: [],
    };
  }
  if (picks.length === 0) {
    return { hasPicks: false, picksMessage: NO_PICK_MESSAGE, accaMessages: [] };
  }

  const tiers = buildAccaTiers(picks);
  return {
    hasPicks: true,
    picksMessage: formatPicksMessage(picks, proHeld),
    accaMessages: tiers.map(formatAccaMessage),
  };
}
