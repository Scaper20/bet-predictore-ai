/**
 * The Code Hub: a handful of ready-made combos a day, one per target price,
 * each published with a SportyBet booking code.
 *
 * The hub is the cheap half of the booking-code plan. One code serves every
 * member who opens it, so a day's hub costs five bookings (ten credits)
 * however many people use it. The per-person generator is the expensive half
 * and is metered separately.
 *
 * Pure, so the selection and the access rules can be tested without the
 * model, the database or parse.bot. The server side is lib/code-hub-feed.ts.
 */

import { forge, type ForgeLeg, type ForgeMarket, type ForgeRisk, type ForgeSettings, type PoolEntry } from "@/lib/forge";
import { isQuotable } from "@/lib/odds/markets";
import { COMBO_PREFIX, gradeMarket } from "@/lib/slip-tracker";

/* ------------------------------------------------------------------ tiers */

export type HubTierId = "2" | "3" | "5" | "10" | "20" | "50" | "100";

export interface HubTier {
  id: HubTierId;
  /** The combined price the combo is built toward. */
  target: number;
  games: number;
  risk: ForgeRisk;
  name: string;
  blurb: string;
  /** Calendar days its games may span, counting today: the long codes reach ahead. */
  days: 1 | 4;
}

/**
 * Shortest price first: the order the page shows them in.
 *
 * Game counts keep every leg near 1.4-1.6 (a 60-70% read): a 20-odds code
 * from six legs would need 1.65s at the floor. Replayed walk-forward over
 * 220 match days (scripts/decision-lab.ts) with these markets and the 60%
 * floor, every tier landed at or above its expected rate: 2-odds 53.6%,
 * 3-odds 35.5%, 5-odds 29.5%, 10-odds 15.4%, 20-odds 14.4%, the four-day
 * 50 4.0% and 100 2.7%.
 */
export const HUB_TIERS: HubTier[] = [
  { id: "2", target: 2, games: 2, risk: "safe", name: "Steady 2", blurb: "Two games the model is surest of", days: 1 },
  { id: "3", target: 3, games: 3, risk: "safe", name: "Solid 3", blurb: "Short prices, a little more reward", days: 1 },
  { id: "5", target: 5, games: 4, risk: "balanced", name: "Balanced 5", blurb: "The everyday combo", days: 1 },
  { id: "10", target: 10, games: 5, risk: "balanced", name: "Stretch 10", blurb: "Longer, still built on strong reads", days: 1 },
  { id: "20", target: 20, games: 7, risk: "balanced", name: "Long shot 20", blurb: "Seven strong reads, lands least often of the day", days: 1 },
  { id: "50", target: 50, games: 9, risk: "balanced", name: "Four-day 50", blurb: "Up to four days of games, nine strong reads", days: 4 },
  { id: "100", target: 100, games: 11, risk: "balanced", name: "Four-day 100", blurb: "Up to four days of games, eleven strong reads", days: 4 },
];

/** The one code free accounts see in full before kick-off. */
export const FREE_TIER_ID: HubTierId = "2";

export function hubTier(id: string): HubTier | undefined {
  return HUB_TIERS.find((t) => t.id === id);
}

/* -------------------------------------------------------------- building */

/** What the hub keeps of a Forge leg. Stored as JSON, so plain values only. */
export interface HubLeg {
  matchId: string;
  homeName: string;
  awayName: string;
  league: string;
  leagueCode?: string;
  kickoff: string;
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** SportyBet's price when the board had one; the model's fair odds stand in otherwise. */
  price: number | null;
}

export function toHubLeg(l: ForgeLeg): HubLeg {
  return {
    matchId: l.matchId,
    homeName: l.homeName,
    awayName: l.awayName,
    league: l.league,
    leagueCode: l.leagueCode,
    kickoff: l.kickoff,
    market: l.market,
    label: l.label,
    probability: l.probability,
    fairOdds: l.fairOdds,
    price: l.price,
  };
}

/** No leg below this: a code is only as strong as its weakest read. */
export const HUB_LEG_MIN_PROBABILITY = 0.6;
/** A game sits in at most this many codes, always with the same pick. */
export const HUB_MAX_CODES_PER_GAME = 2;
/**
 * A code is published only at this share of its tier's odds or more. Without
 * it the builder shipped whatever its game count added up to: replayed over
 * twelve months, 88 of 199 "100" codes came in under 90 (the lowest 28.8).
 */
export const HUB_MIN_TARGET_SHARE = 0.9;

/** The Forge markets the hub asks candidatesFor for; hubMarketAllowed narrows them. */
export const HUB_FORGE_MARKETS: ForgeMarket[] = ["result", "double_chance", "goals", "handicap"];

/**
 * Markets a hub leg may use: match result, double chance and over 1.5 goals.
 *
 * Replayed over 220 match days (scripts/decision-lab.ts), codes from these
 * three landed at or above their expected rate at every tier (5-odds 29.5%
 * against 21.2%, 20-odds 14.4% against 6.8%). Adding half-goal Asian
 * handicap lines lowered every tier from 5 odds up (5-odds 24.7%, 10-odds
 * 10.7%): the +1.5 lines it reached for landed below their stated chance.
 * Handicap stays bookable (odds/markets.ts) and can be passed in by a caller.
 * Unders are paused everywhere for now (model/paused.ts).
 */
export function hubMarketAllowed(market: string): boolean {
  const [family, side, line] = market.split(":");
  if (family === "1x2" || family === "dc") return true;
  return family === "ou" && side === "over" && line === "1.5";
}

/** Half-goal Asian handicap lines, for a caller that wants them in the hub. */
export function withHandicap(market: string): boolean {
  if (hubMarketAllowed(market)) return true;
  const [family, , line] = market.split(":");
  return family === "ah" && Math.abs((Number(line) * 2) % 2) === 1;
}

/**
 * The pool with only what the hub may use and SportyBet can book: single
 * picks on allowed markets with a confirmed SportyBet address, at the
 * hub's floor. Same-game combos and unmapped markets never reach a code.
 */
export function bookablePool(pool: PoolEntry[], allow: (market: string) => boolean = hubMarketAllowed): PoolEntry[] {
  return pool
    .map((e) => ({
      ...e,
      candidates: e.candidates.filter(
        (c) =>
          !c.market.startsWith(COMBO_PREFIX) &&
          isQuotable(c.market) &&
          allow(c.market) &&
          c.probability >= HUB_LEG_MIN_PROBABILITY,
      ),
    }))
    .filter((e) => e.candidates.length > 0);
}

export function hubSettings(tier: HubTier): ForgeSettings {
  return {
    risk: tier.risk,
    targetOdds: tier.target,
    games: tier.games,
    picksPerGame: 1,
    markets: HUB_FORGE_MARKETS,
    when: "today",
    leagues: "all",
    stake: 1000,
  };
}

/** A stable number for a day, so the same pool builds the same hub. */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface BuiltCode {
  tier: HubTierId;
  legs: ForgeLeg[];
}

/**
 * The day's combos, one per tier.
 *
 * Daily tiers draw on `today`; the four-day tiers on `ahead` (today plus the
 * next three days). Built shortest first, and every game is shared across
 * codes under two rules: at most HUB_MAX_CODES_PER_GAME codes, and always the
 * same pick, so one result never sinks every code and no two codes take
 * opposite sides of a game. Each tier is also steered away from games the
 * shorter ones used. A tier that cannot reach its game count, or comes in
 * under HUB_MIN_TARGET_SHARE of its odds, is left out rather than published
 * short.
 */
export function buildHub(
  today: PoolEntry[],
  day: string,
  ahead: PoolEntry[] = today,
  allow: (market: string) => boolean = hubMarketAllowed,
): BuiltCode[] {
  const pools = { 1: bookablePool(today, allow), 4: bookablePool(ahead, allow) };
  const uses = new Map<string, { market: string; count: number }>();
  const out: BuiltCode[] = [];
  const seed = daySeed(day);
  for (const tier of HUB_TIERS) {
    const pool = pools[tier.days]
      .filter((e) => (uses.get(e.prediction.match.id)?.count ?? 0) < HUB_MAX_CODES_PER_GAME)
      .map((e) => {
        const used = uses.get(e.prediction.match.id);
        return used ? { ...e, candidates: e.candidates.filter((c) => c.market === used.market) } : e;
      })
      .filter((e) => e.candidates.length > 0);
    const { legs } = forge(pool, hubSettings(tier), {
      locked: [],
      removed: [],
      avoid: [...uses.keys()],
      seed: seed + Number(tier.id),
    });
    if (legs.length < tier.games || hubTotals(legs).odds < HUB_MIN_TARGET_SHARE * tier.target) continue;
    for (const l of legs) {
      const prev = uses.get(l.matchId);
      uses.set(l.matchId, { market: l.market, count: (prev?.count ?? 0) + 1 });
    }
    out.push({ tier: tier.id, legs });
  }
  return out;
}

/* ---------------------------------------------------------------- totals */

export const hubLegOdds = (l: Pick<HubLeg, "price" | "fairOdds">) => l.price ?? l.fairOdds;

export function hubTotals(legs: HubLeg[]) {
  return {
    odds: legs.reduce((o, l) => o * hubLegOdds(l), 1),
    probability: legs.reduce((p, l) => p * l.probability, 1),
    firstKickoff: Math.min(...legs.map((l) => Date.parse(l.kickoff))),
    lastKickoff: Math.max(...legs.map((l) => Date.parse(l.kickoff))),
  };
}

/* ---------------------------------------------------------------- access */

export type HubAccess = "open" | "locked";

/**
 * Whether a viewer sees a code's games and booking code.
 *
 * Paid members see every code. Free accounts see the 2-odds code in full,
 * and every other code once its first game has kicked off, when the code can
 * no longer be loaded but the games and the result are proof of the work.
 */
export function hubAccess(tier: HubTierId, firstKickoff: number, paid: boolean, now = Date.now()): HubAccess {
  if (paid || tier === FREE_TIER_ID) return "open";
  return now >= firstKickoff ? "open" : "locked";
}

/* ------------------------------------------------------------ settlement */

export type HubLegResult = "win" | "loss" | "void" | "pending";
export type HubStatus = "pending" | "live" | "won" | "lost";

export interface FinalScore {
  home: number;
  away: number;
}

export function hubLegResult(leg: HubLeg, score: FinalScore | undefined): HubLegResult {
  if (!score) return "pending";
  const r = gradeMarket(leg.market, score.home, score.away);
  if (r === null) return "pending";
  return r === "win" ? "win" : r === "lose" ? "loss" : "void";
}

/** A combo is lost at its first losing leg and won when every leg is in. */
export function hubStatus(results: HubLegResult[], firstKickoff: number, now = Date.now()): HubStatus {
  if (results.includes("loss")) return "lost";
  if (results.length > 0 && results.every((r) => r === "win" || r === "void")) return "won";
  return now >= firstKickoff ? "live" : "pending";
}

/* ----------------------------------------------------------------- codes */

/**
 * Where a code stands.
 *
 * "waiting": published, the code is not out yet (before launch, or before
 * the morning booking has run). "ready": the code loads on SportyBet.
 * "started": the first game has kicked off; the code stays on the card,
 * with its games and results, until the last game ends, so everyone can see
 * what was published, though SportyBet stops loading it at the first
 * kick-off. "closed": the games started and no code was ever booked.
 */
export type CodeState =
  | { state: "ready"; bookingCode: string; deadline: number }
  | { state: "started"; bookingCode: string }
  | { state: "waiting" }
  | { state: "closed" };

export function codeState(
  stored: { bookingCode: string | null; deadline: string | null },
  firstKickoff: number,
  now = Date.now(),
): CodeState {
  if (now >= firstKickoff) return stored.bookingCode ? { state: "started", bookingCode: stored.bookingCode } : { state: "closed" };
  if (stored.bookingCode && stored.deadline) {
    const deadline = Date.parse(stored.deadline);
    if (deadline > now) return { state: "ready", bookingCode: stored.bookingCode, deadline };
    return { state: "started", bookingCode: stored.bookingCode };
  }
  return { state: "waiting" };
}

/** How long after its last kick-off a code counts as running: a match plus stoppages and a margin. */
export const CODE_RUN_MS = 2.5 * 3600_000;

/** Whether a code's games may still be in play. */
export function codeRunning(lastKickoff: number, now = Date.now()): boolean {
  return now < lastKickoff + CODE_RUN_MS;
}

/** Lagos calendar day, YYYY-MM-DD: the hub's unit of publication. */
export function hubDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}
