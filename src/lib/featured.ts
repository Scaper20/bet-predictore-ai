import type { Match } from "@/lib/types";
import type { Prediction } from "@/lib/model/predict";
import { rankLeague, LEAGUES } from "@/lib/leagues";

/**
 * Which matches lead the homepage, and why.
 *
 * The board used to be `live.length > 0 ? live : upcoming` sliced to four —
 * an all-or-nothing switch over an ordering that ranks league importance
 * above kickoff time, so a single live fixture anywhere hid every big match
 * of the day, and a Premier League tie on Saturday outranked an NPFL match
 * starting in twenty minutes.
 *
 * IMPORTANT: this is a proxy for interest, not a measure of it. There is not
 * a single behavioural signal anywhere in this system — no views, no
 * favourites, no follows, no analytics table — so every term below is derived
 * from the model or the fixture list. The `engagement` term exists at a real
 * weight and returns null until something real can feed it; see the null rule
 * on `score()`.
 */

export interface FeaturedCandidate {
  prediction: Prediction;
  /** 0-1 measure of real interest, or null while none exists. */
  engagement?: number | null;
}

export type FeaturedReasonCode =
  | "live"
  | "conviction"
  | "tension"
  | "marquee"
  | "imminent"
  | "featured";

export const REASON_LABEL: Record<FeaturedReasonCode, string> = {
  live: "Live now",
  conviction: "Strongest read",
  tension: "Too close to call",
  marquee: "Biggest match",
  imminent: "Kicks off soon",
  featured: "Worth a look",
};

export interface FeaturedMatch {
  prediction: Prediction;
  score: number;
  reason: FeaturedReasonCode;
}

export interface FeatureWeights {
  stature: number;
  imminence: number;
  conviction: number;
  evidence: number;
  tension: number;
  engagement: number;
}

/**
 * Weights sum to 1 for readability only — `score()` renormalises over
 * whichever terms are present, so they do not have to.
 */
export const DEFAULT_WEIGHTS: FeatureWeights = {
  stature: 0.26,
  imminence: 0.24,
  conviction: 0.20,
  evidence: 0.12,
  tension: 0.08,
  engagement: 0.10,
};

/** Beyond this, a fixture is too far off to lead the page. */
const HORIZON_HOURS = 72;
/** Decay constant: a match 18h out scores ~37% of one kicking off now. */
const IMMINENCE_TAU_HOURS = 18;
/** How long a kicked-off-but-not-live fixture stays eligible. */
const STALE_GRACE_MS = 3 * 60 * 60 * 1000;

const MAX_RANK = LEAGUES.length;

function isLiveStatus(status: Match["status"]): boolean {
  return status === "live" || status === "halftime";
}

/** 1 for the top-ranked competition, ~0 for one that isn't in the catalogue. */
export function stature(code: string | undefined): number {
  const rank = rankLeague(code);
  if (rank > MAX_RANK) return 0;
  return (MAX_RANK - rank + 1) / MAX_RANK;
}

/**
 * Exponential decay on time-to-kickoff, live pinned at 1.
 *
 * Exponential rather than linear because this is the term that fixes
 * compareMatches ranking kickoff third: a linear ramp over three days barely
 * separates "in twenty minutes" from "this evening", which is the distinction
 * that actually matters to someone opening the page now.
 */
export function imminence(kickoff: string, status: Match["status"], now: number): number {
  if (isLiveStatus(status)) return 1;
  const hours = (Date.parse(kickoff) - now) / 3_600_000;
  if (!Number.isFinite(hours)) return 0;
  if (hours <= 0) return 1;
  if (hours > HORIZON_HOURS) return 0;
  return Math.exp(-hours / IMMINENCE_TAU_HOURS);
}

/**
 * How close the match is, for live games only.
 *
 * A one-goal game in the 85th minute is the most watchable thing on the
 * board; a 4-0 in the 20th is not, however big the fixture. Scheduled
 * matches return 0 rather than null — their tension is genuinely zero-valued
 * here, not unknown, so the weight should still count against them.
 */
export function tension(match: Match, regulationMinutes = 90): number {
  if (!isLiveStatus(match.status)) return 0;

  const home = match.score.home ?? 0;
  const away = match.score.away ?? 0;
  const margin = Math.abs(home - away);
  const closeness = margin === 0 ? 1 : margin === 1 ? 0.7 : margin === 2 ? 0.25 : 0;

  const minute = Math.min(regulationMinutes, Math.max(0, match.minute ?? regulationMinutes / 2));
  const lateness = minute / regulationMinutes;

  return closeness * (0.4 + 0.6 * lateness);
}

/**
 * Weighted score in 0-1.
 *
 * A term that returns null drops out AND takes its weight with it, the total
 * renormalising over what remains. That is what lets `engagement` sit here at
 * a real 0.10 today, contributing nothing, and start counting the day there
 * is something to feed it — without re-tuning every other weight to
 * compensate. A term returning 0 is a different statement: it means "measured,
 * and it is zero", and its weight still counts against the match.
 */
export function score(
  candidate: FeaturedCandidate,
  now: number,
  weights: FeatureWeights = DEFAULT_WEIGHTS,
): number {
  const { prediction } = candidate;
  const { match, model, topPick } = prediction;

  const terms: [number, number | null][] = [
    [weights.stature, stature(match.league.code)],
    [weights.imminence, imminence(match.kickoff, match.status, now)],
    [weights.conviction, topPick ? topPick.confidence / 100 : null],
    [weights.evidence, model.dataQuality / 100],
    [weights.tension, tension(match)],
    [weights.engagement, candidate.engagement ?? null],
  ];

  let weighted = 0;
  let total = 0;
  for (const [weight, value] of terms) {
    if (value === null || !Number.isFinite(value)) continue;
    weighted += weight * Math.max(0, Math.min(1, value));
    total += weight;
  }

  return total === 0 ? 0 : weighted / total;
}

/**
 * Whether a fixture may appear on the board at all.
 *
 * `publishable` is the honesty gate the rest of the product already uses: a
 * competition with too little history gets its numbers shown with a warning
 * and no headline pick, and the homepage is the last place that should
 * present one as a confident lead.
 */
export function isEligible(prediction: Prediction, now: number): boolean {
  const { match, sufficiency, topPick } = prediction;

  if (!sufficiency.publishable || !topPick) return false;
  if (match.status === "finished" || match.status === "cancelled" || match.status === "postponed") {
    return false;
  }

  // Live is always eligible regardless of clock — a match that kicked off
  // three hours ago and is still going is exactly what belongs here.
  if (isLiveStatus(match.status)) return true;

  const kickoff = Date.parse(match.kickoff);
  if (!Number.isFinite(kickoff)) return false;
  // A scheduled fixture whose kickoff has passed without the feed marking it
  // live is usually a lagging feed, so it gets a grace period rather than
  // vanishing — but not forever.
  if (kickoff < now - STALE_GRACE_MS) return false;
  if (kickoff > now + HORIZON_HOURS * 3_600_000) return false;

  return true;
}

function reasonFor(candidate: FeaturedCandidate, now: number): FeaturedReasonCode {
  const { prediction } = candidate;
  const { match, model, topPick } = prediction;

  if (isLiveStatus(match.status)) return "live";
  if (topPick && topPick.confidence >= 55) return "conviction";
  if (model.uncertainty >= 0.97) return "tension";
  if (stature(match.league.code) >= 0.75) return "marquee";
  if (imminence(match.kickoff, match.status, now) >= 0.5) return "imminent";
  return "featured";
}

const leagueKey = (m: Match) => m.league.code ?? `raw:${m.league.id}`;

/**
 * Picks the board.
 *
 * `now` is a parameter rather than a Date.now() call so the whole module
 * stays pure and the ordering is testable; callers pass the real clock.
 */
export function selectFeatured(
  candidates: FeaturedCandidate[],
  opts: {
    now: number;
    slots?: number;
    liveSlots?: number;
    maxPerLeague?: number;
    weights?: FeatureWeights;
  },
): FeaturedMatch[] {
  const { now, slots = 4, liveSlots = 2, maxPerLeague = 2, weights = DEFAULT_WEIGHTS } = opts;

  const scored = candidates
    .filter((c) => isEligible(c.prediction, now))
    .map((c) => ({
      prediction: c.prediction,
      score: score(c, now, weights),
      reason: reasonFor(c, now),
    }))
    // Fully deterministic: score, then the earlier kickoff, then id. Without
    // the last two, two equally-scored fixtures could swap places between
    // renders of the same data.
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(a.prediction.match.kickoff) - Date.parse(b.prediction.match.kickoff) ||
        a.prediction.match.id.localeCompare(b.prediction.match.id),
    );

  const live = scored.filter((s) => isLiveStatus(s.prediction.match.status));
  const upcoming = scored.filter((s) => !isLiveStatus(s.prediction.match.status));

  const board: FeaturedMatch[] = [];
  const perLeague = new Map<string, number>();

  const take = (pool: FeaturedMatch[], limit: number, enforceDiversity: boolean) => {
    for (const item of pool) {
      if (board.length >= slots || limit <= 0) break;
      if (board.includes(item)) continue;

      const key = leagueKey(item.prediction.match);
      const used = perLeague.get(key) ?? 0;
      if (enforceDiversity && used >= maxPerLeague) continue;

      board.push(item);
      perLeague.set(key, used + 1);
      limit--;
    }
  };

  // Live gets reserved slots so one good live game is never buried by four
  // big fixtures tomorrow — but only reserved, not guaranteed: an empty live
  // pool simply hands its slots to upcoming.
  take(live, Math.min(liveSlots, slots), true);
  take(upcoming, slots - board.length, true);
  // Anything still short gets filled ignoring the per-league cap. A board of
  // two is worse than a board of four from one competition.
  take(scored, slots - board.length, false);

  return board;
}

/* ------------------------------------------------ Server/client boundary */

/**
 * What the board renders, and nothing more.
 *
 * A full Prediction carries thirty picks, a correct-score grid, both sides'
 * form and ten head-to-head rows. None of that may cross into the client
 * bundle for four hero fixtures, so the board is handed this instead.
 */
export interface FeaturedRow {
  id: string;
  href: string;
  leagueName: string;
  kickoff: string;
  status: Match["status"];
  minute: number | null;
  reason: FeaturedReasonCode;
  home: { name: string; crest?: string; score: number | null };
  away: { name: string; crest?: string; score: number | null };
  probabilities: { home: number; draw: number; away: number };
  pick: { label: string; fairOdds: number } | null;
}

export function toFeaturedRow(featured: FeaturedMatch, href: string): FeaturedRow {
  const { match, markets, topPick } = featured.prediction;
  return {
    id: match.id,
    href,
    leagueName: match.league.name,
    kickoff: match.kickoff,
    status: match.status,
    minute: match.minute ?? null,
    reason: featured.reason,
    home: { name: match.home.name, crest: match.home.crest, score: match.score.home },
    away: { name: match.away.name, crest: match.away.crest, score: match.score.away },
    probabilities: { home: markets.home, draw: markets.draw, away: markets.away },
    pick: topPick ? { label: topPick.label, fairOdds: topPick.fairOdds } : null,
  };
}

/**
 * Trims the candidate pool before prediction.
 *
 * predictBatch fetches training data once per DISTINCT LEAGUE, so cost scales
 * with competitions, not fixtures — widening the pool naively is how a hero
 * board starts making a dozen upstream calls. This caps both, cheaply, using
 * only the fixture list.
 *
 * The league key MUST match what predictBatch groups on (service.ts), or the
 * cap silently stops capping anything. There is a test pinning that.
 */
export function shortlist(
  matches: Match[],
  now: number,
  opts: { maxMatches?: number; maxLeagues?: number } = {},
): Match[] {
  const { maxMatches = 18, maxLeagues = 6 } = opts;

  const ranked = [...matches]
    .filter((m) => {
      if (m.status === "finished" || m.status === "cancelled" || m.status === "postponed") {
        return false;
      }
      if (isLiveStatus(m.status)) return true;
      const kickoff = Date.parse(m.kickoff);
      return (
        Number.isFinite(kickoff) &&
        kickoff >= now - STALE_GRACE_MS &&
        kickoff <= now + HORIZON_HOURS * 3_600_000
      );
    })
    .sort((a, b) => {
      const cheap = (m: Match) =>
        0.5 * stature(m.league.code) + 0.5 * imminence(m.kickoff, m.status, now);
      return cheap(b) - cheap(a) || a.id.localeCompare(b.id);
    });

  const leagues = new Set<string>();
  const out: Match[] = [];

  const admit = (pool: Match[]) => {
    for (const m of pool) {
      if (out.length >= maxMatches) break;
      const key = leagueKey(m);
      if (!leagues.has(key) && leagues.size >= maxLeagues) continue;
      leagues.add(key);
      out.push(m);
    }
  };

  /*
   * Curated competitions get first claim on the league budget.
   *
   * Found the hard way: on a quiet afternoon the feeds are mostly minor
   * competitions the catalogue does not cover, and those filled all six league
   * slots — but an uncatalogued league has no training history behind it, so
   * every one of its fixtures fails `sufficiency.publishable` and the board
   * came back with a single match on it. Spending a scarce slot on a
   * competition that cannot produce a publishable prediction is worse than
   * wasteful: it starves the ones that can.
   *
   * Uncurated fixtures still get whatever budget is left over, so a genuinely
   * quiet slate is not empty for the sake of it.
   */
  admit(ranked.filter((m) => stature(m.league.code) > 0));
  admit(ranked.filter((m) => stature(m.league.code) === 0));

  return out;
}

export { leagueKey };
