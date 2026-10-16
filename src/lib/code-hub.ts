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

import { forge, type ForgeLeg, type ForgeRisk, type ForgeSettings, type PoolEntry } from "@/lib/forge";
import { isQuotable } from "@/lib/odds/markets";
import { COMBO_PREFIX, gradeMarket } from "@/lib/slip-tracker";

/* ------------------------------------------------------------------ tiers */

export type HubTierId = "2" | "3" | "5" | "10" | "20";

export interface HubTier {
  id: HubTierId;
  /** The combined price the combo is built toward. */
  target: number;
  games: number;
  risk: ForgeRisk;
  name: string;
  blurb: string;
}

/** Shortest price first: the order the page shows them in. */
export const HUB_TIERS: HubTier[] = [
  { id: "2", target: 2, games: 2, risk: "safe", name: "Steady 2", blurb: "Two games the model is surest of" },
  { id: "3", target: 3, games: 3, risk: "safe", name: "Solid 3", blurb: "Short prices, a little more reward" },
  { id: "5", target: 5, games: 4, risk: "balanced", name: "Balanced 5", blurb: "The everyday combo" },
  { id: "10", target: 10, games: 5, risk: "balanced", name: "Stretch 10", blurb: "Longer, still built on strong reads" },
  { id: "20", target: 20, games: 6, risk: "risky", name: "Long shot 20", blurb: "Big price, lands least often" },
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

/**
 * The pool with only what SportyBet can book: single picks on markets with a
 * confirmed SportyBet address. Same-game combos and unmapped markets are
 * dropped here, so a combo is never built that cannot be turned into a code.
 */
export function bookablePool(pool: PoolEntry[]): PoolEntry[] {
  return pool
    .map((e) => ({
      ...e,
      candidates: e.candidates.filter((c) => !c.market.startsWith(COMBO_PREFIX) && isQuotable(c.market)),
    }))
    .filter((e) => e.candidates.length > 0);
}

export function hubSettings(tier: HubTier): ForgeSettings {
  return {
    risk: tier.risk,
    targetOdds: tier.target,
    games: tier.games,
    picksPerGame: 1,
    markets: ["result", "double_chance", "goals", "btts"],
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
 * Built shortest first, and each tier is steered away from games the
 * shorter ones already used, so one bad result does not sink every code at
 * once. It is a nudge, not a ban: on a thin day the strongest games may
 * still appear twice. A tier that cannot reach its game count is left out
 * rather than published short.
 */
export function buildHub(pool: PoolEntry[], day: string): BuiltCode[] {
  const bookable = bookablePool(pool);
  const used = new Set<string>();
  const out: BuiltCode[] = [];
  const seed = daySeed(day);
  for (const tier of HUB_TIERS) {
    const { legs } = forge(bookable, hubSettings(tier), {
      locked: [],
      removed: [],
      avoid: [...used],
      seed: seed + Number(tier.id),
    });
    if (legs.length < tier.games) continue;
    for (const l of legs) used.add(l.matchId);
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
 * Where a code stands. "waiting" is the normal state before launch, and on
 * launch day until the morning booking has run: the combo is published, the
 * code is not out yet.
 */
export type CodeState =
  | { state: "ready"; bookingCode: string; deadline: number }
  | { state: "waiting" }
  | { state: "closed" };

export function codeState(
  stored: { bookingCode: string | null; deadline: string | null },
  firstKickoff: number,
  now = Date.now(),
): CodeState {
  if (now >= firstKickoff) return { state: "closed" };
  if (stored.bookingCode && stored.deadline) {
    const deadline = Date.parse(stored.deadline);
    if (deadline > now) return { state: "ready", bookingCode: stored.bookingCode, deadline };
  }
  return { state: "waiting" };
}

/** Lagos calendar day, YYYY-MM-DD: the hub's unit of publication. */
export function hubDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);
}
