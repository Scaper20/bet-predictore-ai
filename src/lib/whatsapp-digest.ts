import { odds, percent, kickoffTime } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import type { PersonalizedPick } from "@/lib/for-you";

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
}

export interface DigestAcca {
  tier: "safe" | "balanced" | "risky";
  label: string;
  legs: DigestAccaLeg[];
  combinedFairOdds: number;
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
    tiers.push({
      tier,
      label,
      legs: legs.map((p) => ({
        fixture: `${p.homeTeam} vs ${p.awayTeam}`,
        league: p.league.shortName,
        selection: p.label,
        fairOdds: p.fairOdds,
      })),
      combinedFairOdds: combinedProbability > 0 ? 1 / combinedProbability : 0,
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

const MAX_PICKS_SHOWN = 6;

export function formatPicksMessage(picks: PersonalizedPick[]): string {
  const shown = picks.slice(0, MAX_PICKS_SHOWN);
  const lines = shown.map(
    (p) =>
      `⚽ ${p.league.shortName}\n` +
      `${p.homeTeam} vs ${p.awayTeam} — ${kickoffTime(p.kickoff)}\n` +
      `*${p.label}* — ${percent(p.probability)} · @${odds(p.fairOdds)} fair odds\n` +
      `Sample: ${p.matchesUsed} matches`,
  );

  const overflow = picks.length - shown.length;
  const header = `*BetriX — Today's Value Picks*\n${shown.length} pick${shown.length === 1 ? "" : "s"} clear our sample-size bar today.`;
  const footer =
    overflow > 0 ? `+${overflow} more at ${SITE_URL}/football/predictions` : `${SITE_URL}/football/predictions`;

  return [header, ...lines, footer].join("\n\n");
}

export function formatAccaMessage(acca: DigestAcca): string {
  const legLines = acca.legs.map((l, i) => `${i + 1}. ${l.fixture} (${l.league}) — *${l.selection}*`);
  return [
    `*${acca.label} acca — @${odds(acca.combinedFairOdds)}*`,
    ...legLines,
    `${acca.legs.length}-leg combined price, true probability — not a bookmaker's version.`,
  ].join("\n\n");
}

export const NO_PICK_MESSAGE = [
  "*BetriX — Today's Value Picks*",
  "No pick clears our sample-size bar today — we'd rather send nothing than guess.",
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
