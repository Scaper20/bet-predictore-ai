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

import { forge, oddsOf, toLeg, type ForgeLeg, type ForgeMarket, type ForgeRisk, type ForgeSettings, type PoolEntry } from "@/lib/forge";
import { isQuotable } from "@/lib/odds/markets";
import { twinsOf } from "@/lib/odds/bookable";
import { pausedByRule } from "@/lib/model/paused";
import { override } from "@/lib/model/selections";
import { COMBO_PREFIX, gradeMarket } from "@/lib/slip-tracker";

/* ------------------------------------------------------------------ tiers */

export type HubTierId = "2" | "3" | "5" | "10" | "20" | "50" | "100";

export interface HubTier {
  id: HubTierId;
  /** The combined price the combo is built toward. */
  target: number;
  /** Its usual length; hubGameRange gives the lengths the builder may use. */
  games: number;
  risk: ForgeRisk;
  name: string;
  blurb: string;
  /** Calendar days its games may span, counting today: the long codes reach ahead. */
  days: 1 | 4;
  /** No longer built; kept so codes already published still render with their name. */
  retired?: boolean;
}

/**
 * Shortest price first: the order the page shows them in.
 *
 * The 2, 3 and 5 odds codes have no fixed game count: each is built at every
 * length in hubGameRange and the build with the strongest weakest leg is kept
 * (compileFlex), so a 2-odds code is usually three or four of the day's
 * surest reads. The longer codes keep their counts, growing only to reach
 * their odds: built the same flexible way they ran to nine-plus legs of 80%
 * reads, and replayed walk-forward over 220 match days (scripts/
 * decision-lab.ts) the 20-odds code then landed 1.3% against 5% expected and
 * the 100 never; one upset sinks a long code, and the model's 60-70% reads
 * beat their stated chance by more (3-4 points a leg) than its 80% ones.
 * As shipped, replayed the same way: 2-odds 53.6% against 50.0% expected,
 * 3-odds 39.7% against 33.3%, 5-odds 21.2% against 20.0%, 10-odds 9.9%,
 * 20-odds 2.6% against 5.1% (76 codes), the four-day 50 3.0% and 100 3.2%.
 *
 * The four-day 50 and 100 were retired on 17 Oct 2026: they lose 97 and 99
 * times in 100 by design, which reads as a hub that always loses.
 */
export const HUB_TIERS: HubTier[] = [
  { id: "2", target: 2, games: 2, risk: "safe", name: "Steady 2", blurb: "The model's surest reads, two to four games", days: 1 },
  { id: "3", target: 3, games: 3, risk: "safe", name: "Solid 3", blurb: "Short prices, a little more reward", days: 1 },
  { id: "5", target: 5, games: 4, risk: "balanced", name: "Balanced 5", blurb: "The everyday combo", days: 1 },
  { id: "10", target: 10, games: 5, risk: "balanced", name: "Stretch 10", blurb: "Longer, still built on strong reads", days: 1 },
  { id: "20", target: 20, games: 7, risk: "balanced", name: "Long shot 20", blurb: "Seven to eleven strong reads, lands least often of the day", days: 1 },
  { id: "50", target: 50, games: 9, risk: "balanced", name: "Four-day 50", blurb: "Up to four days of games, nine to eleven strong reads", days: 4, retired: true },
  { id: "100", target: 100, games: 11, risk: "balanced", name: "Four-day 100", blurb: "Up to four days of games, eleven to thirteen strong reads", days: 4, retired: true },
];

/** The tiers the hub still builds, shortest first. */
export const HUB_LIVE_TIERS: HubTier[] = HUB_TIERS.filter((t) => !t.retired);

/** The one code free accounts see in full before kick-off. */
export const FREE_TIER_ID: HubTierId = "2";

export function hubTier(id: string): HubTier | undefined {
  return HUB_TIERS.find((t) => t.id === id);
}

/** Codes at or under these odds take any length in their range; longer ones keep their count. */
export const HUB_FLEX_MAX_TARGET = 5;

/** How a tier's code is put together: see HUB_TIERS. */
export function hubStrategy(tier: Pick<HubTier, "target">): "flex" | "count" {
  return tier.target <= HUB_FLEX_MAX_TARGET ? "flex" : "count";
}

/**
 * The lengths a tier's code may take: a flexible code from one game under its
 * usual count (never a single) up to HUB_EXTRA_GAMES over, a counted one from
 * its count up to HUB_COUNT_EXTRA_GAMES over.
 */
export function hubGameRange(tier: Pick<HubTier, "games" | "target">): [number, number] {
  const flex = hubStrategy(tier) === "flex";
  return [flex ? Math.max(2, tier.games - 1) : tier.games, tier.games + (flex ? HUB_EXTRA_GAMES : HUB_COUNT_EXTRA_GAMES)];
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
/**
 * Games a tier may add over its usual count: with every leg at 60% or more,
 * five legs rarely make 10 and seven rarely make 20, and more, safer legs
 * beat leaving the tier out.
 */
export const HUB_EXTRA_GAMES = 2;
/**
 * The 10 and 20 may add more. Built to SportyBet's prices rather than fair
 * odds (28 Oct 2026), a 20 at two extra games was never reached in a year's
 * replay (scripts/decision-lab.ts --hub=18) and a 10 on 87 days of 225; at
 * four, on 73 and 117 days, loading at 19.4 and 9.7 on average.
 */
export const HUB_COUNT_EXTRA_GAMES = 4;

/** The Forge markets the hub asks candidatesFor for; hubMarketAllowed narrows them. */
export const HUB_FORGE_MARKETS: ForgeMarket[] = ["result", "double_chance", "goals", "handicap"];

/**
 * Markets a hub leg may use: match result, double chance, over 1.5 goals and
 * half-goal Asian handicap lines (away +1.5, home -1.5 and the like).
 *
 * Replayed over 220 match days (scripts/decision-lab.ts), codes from these
 * landed at or above their expected rate at every tier with the flexible
 * game count, and the walk-forward niche lab (scripts/niche-lab.ts) found the
 * +1.5 lines held their stated chance in both seasons (away +1.5 rated 69%+
 * landed 80.2% on the 2025-26 holdout). With fixed game counts the handicap
 * made no difference either way; every builder pooled within noise of the
 * others. Unders are paused everywhere for now (model/paused.ts).
 */
export function hubMarketAllowed(market: string): boolean {
  // Switched by the owner (model/selections.ts) before the rules below.
  const o = override(market, "codeHub");
  if (o !== undefined) return o;
  return hubByRule(market);
}

/** Whether the rules in code let a code carry this market, whatever the owner has switched. */
export function hubByRule(market: string): boolean {
  const [family, side, line] = market.split(":");
  if (family === "1x2" || family === "dc") return true;
  // The three-way handicap SportyBet lists in place of a big Asian line wins
  // on exactly the same results (odds/bookable.ts), so it follows that line.
  if (family === "eh") return twinsOf(market).some((t) => t.market.startsWith("ah:") && hubMarketAllowed(t.market));
  // Only +-0.5 while the goal-or-more lines are paused (model/paused.ts).
  if (family === "ah") return Math.abs((Number(line) * 2) % 2) === 1 && !pausedByRule(market);
  return family === "ou" && side === "over" && line === "1.5";
}

/** The October hub's markets, without the handicap lines, for comparison in the lab. */
export function withoutHandicap(market: string): boolean {
  return hubMarketAllowed(market) && !market.startsWith("ah:");
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
    days: null,
    leagues: [],
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
 * shorter ones used. Each tier is built its own way (hubStrategy); one
 * with no build within reach of HUB_MIN_TARGET_SHARE of its odds is left
 * out rather than published short.
 */
export function buildHub(
  today: PoolEntry[],
  day: string,
  ahead: PoolEntry[] = today,
  allow: (market: string) => boolean = hubMarketAllowed,
  options: HubBuildOptions = {},
): BuiltCode[] {
  const pools = { 1: bookablePool(today, allow), 4: bookablePool(ahead, allow) };
  const uses = new Map<string, { market: string; count: number }>();
  const out: BuiltCode[] = [];
  const seed = daySeed(day);
  for (const tier of HUB_LIVE_TIERS) {
    const pool = pools[tier.days]
      .filter((e) => (uses.get(e.prediction.match.id)?.count ?? 0) < HUB_MAX_CODES_PER_GAME)
      .map((e) => {
        const used = uses.get(e.prediction.match.id);
        return used ? { ...e, candidates: e.candidates.filter((c) => c.market === used.market) } : e;
      })
      .filter((e) => e.candidates.length > 0);
    let legs: ForgeLeg[] | null = null;
    const strategy = options.strategy ?? hubStrategy(tier);
    if (strategy === "best") legs = compileBest(pool, tier.target, [...uses.keys()], { ...options, maxLegs: options.maxLegs ?? tier.games + HUB_EXTRA_GAMES });
    if (strategy === "flex") legs = compileFlex(pool, tier, [...uses.keys()], seed + Number(tier.id), options);
    for (let games = tier.games; strategy === "count" && games <= tier.games + (options.extraGames ?? HUB_COUNT_EXTRA_GAMES) && !legs; games++) {
      const built = forge(pool, { ...hubSettings(tier), games }, {
        locked: [],
        removed: [],
        avoid: [...uses.keys()],
        seed: seed + Number(tier.id),
      }).legs;
      if (built.length >= games && buildOdds(built) >= HUB_MIN_TARGET_SHARE * tier.target) legs = built;
    }
    if (!legs) continue;
    for (const l of legs) {
      const prev = uses.get(l.matchId);
      uses.set(l.matchId, { market: l.market, count: (prev?.count ?? 0) + 1 });
    }
    out.push({ tier: tier.id, legs });
  }
  return out;
}

export interface HubBuildOptions {
  /**
   * Every tier one way, for the lab; absent, each tier uses hubStrategy.
   * "flex": every length in hubGameRange, the strongest kept (compileFlex).
   * "count": the tier's usual count, growing only when short of its odds.
   * "best": every game's strongest leg, ranked, added until the code reaches
   * its odds (compileBest). Replayed, "best" landed at its expected rate but
   * on fewer days (64% against 74%): 80% legs at 1.2 need many games to reach
   * the odds, and one miss sinks the code.
   */
  strategy?: "count" | "best" | "flex";
  /** How sure a leg really is: the stated chance, or one corrected by its own record. */
  quality?: (market: string, probability: number) => number;
  /** Legs shorter than this add risk without adding odds. */
  minLegOdds?: number;
  maxLegs?: number;
  /** "count" only: games a tier may add over its usual count (HUB_COUNT_EXTRA_GAMES), for the lab. */
  extraGames?: number;
  /**
   * "best" only: raise the shortest leg allowed to what the code's odds need
   * inside its game limit, Forge's rule (forge.ts forgeBest), so a long code
   * is reached with strong legs rather than a dozen 1.2s.
   */
  scaled?: boolean;
}

/**
 * Best legs first: each game offers its single strongest pick (by `quality`),
 * the games are ranked by it, and legs are added in that order until the code
 * reaches HUB_MIN_TARGET_SHARE of its odds. A leg that would carry the code
 * far past its odds is passed over for the next. However many legs that takes
 * is the code's length: a 2-odds code can be three or four strong legs.
 */
export function compileBest(pool: PoolEntry[], target: number, avoid: string[], options: HubBuildOptions): ForgeLeg[] | null {
  const quality = options.quality ?? ((_: string, p: number) => p);
  const maxLegs = options.maxLegs ?? 20;
  const minOdds = Math.max(options.minLegOdds ?? 1.15, options.scaled ? Math.pow(target, 1 / maxLegs) * 1.02 : 0);
  const avoided = new Set(avoid);
  const ranked = pool
    .flatMap((e) => {
      const options_ = e.candidates.filter((c) => oddsOf(c) >= minOdds);
      if (options_.length === 0) return [];
      const best = options_.reduce((a, b) => (quality(b.market, b.probability) > quality(a.market, a.probability) ? b : a));
      // A game a shorter code already uses ranks a little lower, so codes spread.
      const q = quality(best.market, best.probability) - (avoided.has(e.prediction.match.id) ? 0.03 : 0);
      return [{ entry: e, c: best, q }];
    })
    .sort((a, b) => b.q - a.q);
  const legs: ForgeLeg[] = [];
  let odds = 1;
  for (const r of ranked) {
    if (odds >= HUB_MIN_TARGET_SHARE * target || legs.length >= maxLegs) break;
    if (odds * oddsOf(r.c) > target * 1.3) continue;
    legs.push(toLeg(r.entry, r.c));
    odds *= oddsOf(r.c);
  }
  return odds >= HUB_MIN_TARGET_SHARE * target ? legs.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)) : null;
}

/**
 * No fixed game count: the code is built at every length in hubGameRange and
 * the build whose weakest leg is strongest wins, the shorter on a tie. A
 * 2-odds code becomes three games when three reads reach 2 odds without one
 * as shaky as the best pair's weaker leg. Every build lands about as often as
 * its odds say (a calibrated chance times fair odds is 1 at any length), so
 * the choice is about the reads, not the arithmetic.
 */
export function compileFlex(pool: PoolEntry[], tier: HubTier, avoid: string[], seed: number, options: HubBuildOptions): ForgeLeg[] | null {
  const quality = options.quality ?? ((_: string, p: number) => p);
  const [fewest, most] = hubGameRange(tier);
  let best: { legs: ForgeLeg[]; weakest: number } | null = null;
  for (let games = fewest; games <= most; games++) {
    const legs = forge(pool, { ...hubSettings(tier), games }, { locked: [], removed: [], avoid, seed }).legs;
    if (legs.length < games) continue;
    const odds = buildOdds(legs);
    if (odds < HUB_MIN_TARGET_SHARE * tier.target || odds > tier.target * 1.3) continue;
    const weakest = Math.min(...legs.map((l) => quality(l.market, l.probability)));
    if (!best || weakest > best.weakest + 1e-9) best = { legs, weakest };
  }
  return best?.legs ?? null;
}

/* ---------------------------------------------------------------- totals */

/**
 * What a code will load at on SportyBet while it is being built: each leg's
 * SportyBet price, or its fair odds less a typical margin where the board
 * has none (forge.ts oddsOf). Every gate against a tier's odds uses this, so
 * a "10" is a 10 at SportyBet's prices, not the model's.
 */
export const buildOdds = (legs: readonly Pick<ForgeLeg, "price" | "fairOdds">[]) => legs.reduce((o, l) => o * oddsOf(l), 1);

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
