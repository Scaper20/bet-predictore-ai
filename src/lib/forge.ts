/**
 * KiqStat Forge — builds a slip to the user's taste out of the model's own
 * numbers. No language model is involved: every probability is read off the
 * same fitted scoreline grid the match pages show.
 *
 * Pure, so the engine and its tests agree. The server (lib/forge-feed.ts)
 * gathers the predictions and prices; this decides what goes on the slip.
 */

import type { Pick as ModelPick, Prediction } from "@/lib/model/predict";
import { isPausedPick } from "@/lib/model/paused";
import type { Surface } from "@/lib/model/selections";
import { isStatMarket, SWEET_SPOT_FILLERS, SWEET_SPOT_MAX, SWEET_SPOTS, sweetSpotLabel } from "@/lib/model/sweet-spots";
import { scoreMatrix } from "@/lib/model/poisson";
import { halfGrids, halfRates, SITE_FIRST_HALF_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT } from "@/lib/model/halves";
import { COMBO_PREFIX, gradeMarket } from "@/lib/slip-tracker";
import type { KickoffWindow } from "@/lib/time-windows";

/* ------------------------------------------------------------------ types */

export type ForgeRisk = "safe" | "balanced" | "risky";
export type ForgeMarket = "result" | "double_chance" | "goals" | "btts" | "handicap" | "corners" | "shots";
export type ForgeWhen = Extract<KickoffWindow, "today" | "tonight" | "tomorrow" | "weekend" | "next_3_days">;

/** Free plan: 1X2 and double chance; every other market is Pro. */
export const FORGE_MARKETS: { id: ForgeMarket; label: string; paid?: boolean }[] = [
  { id: "result", label: "Match result" },
  { id: "double_chance", label: "Two results" },
  // Unders are paused as picks (model/predict.ts PAUSED_PICK_MARKETS).
  { id: "goals", label: "Over goals", paid: true },
  { id: "btts", label: "Both score", paid: true },
  { id: "handicap", label: "Handicap", paid: true },
  // Only the lines that held 82%+ on a season they were not chosen on (model/sweet-spots.ts).
  { id: "corners", label: "Corners", paid: true },
  { id: "shots", label: "Shots", paid: true },
];

/** The markets a settings object may use on this plan; never empty. */
export function marketsForPlan(markets: ForgeMarket[], paid: boolean): ForgeMarket[] {
  if (paid) return markets;
  const open = markets.filter((m) => !FORGE_MARKETS.find((x) => x.id === m)?.paid);
  return open.length ? open : ["result"];
}

export const FORGE_WHEN: { id: ForgeWhen; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tonight", label: "Tonight" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "next_3_days", label: "Next 3 days" },
];

/** What each style fills in when tapped; the user can still change any of it. */
export const RISK_PRESETS: Record<ForgeRisk, { targetOdds: number; games: number; label: string; blurb: string }> = {
  safe: { targetOdds: 2.5, games: 3, label: "Safe", blurb: "Short prices, games we're most sure of" },
  balanced: { targetOdds: 5, games: 4, label: "Balanced", blurb: "A mix, the default" },
  risky: { targetOdds: 20, games: 5, label: "Risky", blurb: "Bigger prices, lands less often" },
};

/** Per-leg price bounds (oddsOf) and the least likely leg each style will take. */
const RISK_BOUNDS: Record<ForgeRisk, { min: number; max: number; minProb: number }> = {
  safe: { min: 1.1, max: 1.8, minProb: 0.55 },
  balanced: { min: 1.18, max: 2.6, minProb: 0.38 },
  risky: { min: 1.3, max: 6, minProb: 0.16 },
};

export interface ForgeSettings {
  risk: ForgeRisk;
  targetOdds: number;
  games: number;
  picksPerGame: 1 | 2 | 3;
  markets: ForgeMarket[];
  when: ForgeWhen;
  /** "all", "mine" (the user's onboarding leagues) or one league code. */
  leagues: string;
  stake: number;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  risk: "balanced",
  targetOdds: 5,
  // Exactly this many games (forge-solve.ts): the Balanced preset's count.
  games: 4,
  picksPerGame: 2,
  markets: ["result", "double_chance", "goals", "btts"],
  when: "today",
  leagues: "all",
  stake: 1000,
};

export interface ForgePick {
  market: string;
  label: string;
}

/** One game on a Forge slip. Single picks and same-game combos share this shape. */
export interface ForgeLeg {
  matchId: string;
  fixture: string;
  homeName: string;
  awayName: string;
  league: string;
  leagueCode?: string;
  kickoff: string;
  picks: ForgePick[];
  /** The pick's market id, or "combo:a+b" for a same-game combo. */
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** SportyBet's price, single picks only — bookmakers price combos their own way. */
  price: number | null;
  reason: string | null;
  dataQuality: number;
}

/* ------------------------------------------------------------- labelling */

const STAT_NOUN: Record<string, string> = { corners: "corners", shots: "shots", sot: "shots on target", bookings: "bookings" };

/** "Arsenal to win" rather than "Home Win": the slip should read like a betslip. */
export function friendlyLabel(market: string, home: string, away: string, fallback: string): string {
  const team = (side: string) => (side === "home" ? home : away);
  const signedLine = (x: number) => `${x > 0 ? "+" : ""}${x}`;
  const ou = market.match(/^ou:(over|under):(\d+(?:\.\d+)?)$/);
  if (ou) return `${ou[1] === "over" ? "Over" : "Under"} ${ou[2]} goals`;
  const ah = market.match(/^ah:(home|away):(-?\d+(?:\.\d+)?)$/);
  if (ah) {
    const line = Number(ah[2]);
    return line === 0 ? `${team(ah[1])} (draw no bet)` : `${team(ah[1])} ${signedLine(line)}`;
  }
  const dnb = market.match(/^dnb:(home|away)$/);
  if (dnb) return `${team(dnb[1])} (draw no bet)`;
  // Three-way handicap: the line is the home side's head start ("eh:away:-2" is the away side +2).
  const eh = market.match(/^eh:(home|draw|away):([+-]?\d+)$/);
  if (eh) {
    const homeLine = Number(eh[2]);
    if (eh[1] === "draw") return `Draw with ${home} ${signedLine(homeLine)} (3-way)`;
    return `${team(eh[1])} ${signedLine(eh[1] === "home" ? homeLine : -homeLine)} (3-way)`;
  }
  const tg = market.match(/^tg:(home|away):(over|under):(\d+(?:\.\d+)?)$/);
  if (tg) return `${team(tg[1])} ${tg[2]} ${tg[3]} goals`;
  const [family, a, b, c] = market.split(":");
  const noun = STAT_NOUN[family];
  if (noun) {
    if ((a === "over" || a === "under") && b) return `${a === "over" ? "Over" : "Under"} ${b} ${noun}`;
    if ((a === "home" || a === "away") && (b === "over" || b === "under") && c) return `${team(a)} ${b} ${c} ${noun}`;
    if (a === "most") {
      if (b === "level") return `Level on ${noun}`;
      if (b?.endsWith("-or-level")) return `${team(b.split("-")[0])} level or more ${noun}`;
      if (b === "home" || b === "away") return `${team(b)} more ${noun}`;
    }
    if (a === "hcp" && (b === "home" || b === "away") && c) return `${team(b)} ${c} ${noun} handicap`;
  }
  switch (market) {
    case "1x2:home":
      return `${home} to win`;
    case "1x2:away":
      return `${away} to win`;
    case "1x2:draw":
      return "Draw";
    case "dc:home-draw":
      return `${home} or draw`;
    case "dc:away-draw":
      return `${away} or draw`;
    case "dc:home-away":
      return `${home} or ${away}`;
    case "btts:yes":
      return "Both teams score";
    case "btts:no":
      return "Not both to score";
    default:
      return fallback;
  }
}

/** The short form used on a combo: "Arsenal & Over 1.5". */
function shortPart(market: string, home: string, away: string, fallback: string): string {
  if (market === "1x2:home") return home;
  if (market === "1x2:away") return away;
  const ou = market.match(/^ou:(over|under):(\d+(?:\.\d+)?)$/);
  if (ou) return `${ou[1] === "over" ? "Over" : "Under"} ${ou[2]}`;
  if (market === "btts:yes") return "GG";
  if (market === "btts:no") return "NG";
  return friendlyLabel(market, home, away, fallback);
}

/* ------------------------------------------------------------ candidates */

type Family = "result" | "goals" | "btts" | "corners" | "shots";

const GROUP_MARKET: Partial<Record<ModelPick["group"], ForgeMarket>> = {
  "Match Result": "result",
  "Double Chance": "double_chance",
  Goals: "goals",
  "Both Teams To Score": "btts",
  "Asian Handicap": "handicap",
  Corners: "corners",
  Shots: "shots",
};

const FAMILY: Record<ForgeMarket, Family> = {
  result: "result",
  double_chance: "result",
  handicap: "result",
  goals: "goals",
  btts: "btts",
  corners: "corners",
  shots: "shots",
};

export interface CandidateOptions {
  markets: ForgeMarket[];
  picksPerGame: 1 | 2 | 3;
  allowHandicap: boolean;
  /**
   * Which corners and shots lines to offer: "tested" (the sweet-spot lines at
   * the chance each held from, the hub's and editor's rule) or "all" (every
   * line the count model prices with an honest chance, inside a realism band
   * around the game's expected count: Forge, so a corners combo has corners
   * on every game that has the data).
   */
  statLines?: "tested" | "all";
  /** Whose pauses apply (model/selections.ts): the Code Hub has its own switches. */
  surface?: Surface;
}

export interface Candidate {
  picks: ForgePick[];
  market: string;
  label: string;
  probability: number;
  fairOdds: number;
  /** SportyBet's price where the game's board lists this exact selection. */
  price?: number | null;
}

/** P(every pick wins) from the fixture's own scoreline grid — exact, not a product of marginals. */
export function jointProbability(grid: number[][], markets: string[]): number {
  let p = 0;
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      if (grid[x][y] > 0 && markets.every((m) => gradeMarket(m, x, y) === "win")) p += grid[x][y];
    }
  }
  return p;
}

export function gridFor(p: Prediction): number[][] {
  return scoreMatrix(p.markets.expectedGoals.home, p.markets.expectedGoals.away, p.model.rho);
}

const SITE_SHARE = { home: SITE_FIRST_HALF_SHARE, away: SITE_FIRST_HALF_SHARE };

/** The two halves' own score grids, split the way the match page splits them (halves.ts). */
export function halvesFor(p: Prediction): { first: number[][]; second: number[][] } {
  return halfGrids(p.markets.expectedGoals.home, p.markets.expectedGoals.away, SITE_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT);
}

/** Each side's expected goals in each half, the same split: the goal-timing estimate's input (lead-process.ts). */
export function halfRatesFor(p: Prediction) {
  return halfRates(p.markets.expectedGoals.home, p.markets.expectedGoals.away, SITE_SHARE, SITE_HALF_TILT, SITE_SECOND_HALF_TILT);
}

/** The corners and shots rules Forge may use: the tested sweet-spot lines, at the chance each held from. */
const STAT_RULES = [...SWEET_SPOTS, ...SWEET_SPOT_FILLERS].filter((r) => isStatMarket(r.market));

/**
 * Corners and shots singles for one fixture, from the count model's chances
 * (stat-markets-service.ts statChances). Only a tested line, at or above the
 * chance it held its record from: these are graded from match stats, not the
 * score, so they never join a same-game combo.
 */
function statCandidates(stats: Readonly<Record<string, number>> | undefined, allowed: Set<ForgeMarket>): Candidate[] {
  if (!stats) return [];
  return STAT_RULES.flatMap((rule) => {
    const kind: ForgeMarket = rule.market.startsWith("corners:") ? "corners" : "shots";
    const p = stats[rule.market];
    if (!allowed.has(kind) || p === undefined || p < rule.min || p > SWEET_SPOT_MAX) return [];
    const label = sweetSpotLabel(rule.market);
    return [{ picks: [{ market: rule.market, label }], market: rule.market, label, probability: p, fairOdds: 1 / p }];
  });
}

/** Chances outside this range make poor legs: a coin flip, or a price too short to matter. */
const ALL_LINES_MIN = 0.55;
const ALL_LINES_MAX = 0.92;
/** How far from a game's middle line an over or under may sit, in units of the count. */
const STAT_LINE_REACH: Record<string, number> = { corners: 2, shots: 4, sot: 2 };

/**
 * The line a count is as likely to go over as under, for one family and
 * scope ("corners" totals, "corners:home" team totals): the realism anchor.
 * An under far above it, or an over far below it, is a near-certainty only
 * because it is far from the game's own count, and reads as a silly pick.
 */
function middleLines(stats: Readonly<Record<string, number>>): Map<string, number> {
  const best = new Map<string, { line: number; gap: number }>();
  for (const [market, p] of Object.entries(stats)) {
    const m = market.match(/^(corners|shots|sot):(?:(home|away):)?over:(\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const scope = m[2] ? `${m[1]}:${m[2]}` : m[1];
    const gap = Math.abs(p - 0.5);
    const cur = best.get(scope);
    if (!cur || gap < cur.gap) best.set(scope, { line: Number(m[3]), gap });
  }
  return new Map([...best].map(([k, v]) => [k, v.line]));
}

/**
 * Every corners, shots and shots-on-target selection the count model prices
 * for one fixture with a usable chance: totals, team totals, who has more and
 * handicaps. Overs and unders must sit within reach of the game's middle line
 * (an "Under 12.5 corners" on a game expected to have nine is a fact about
 * football, not a read of the game).
 */
export function allStatCandidates(stats: Readonly<Record<string, number>> | undefined, allowed: Set<ForgeMarket>, home: string, away: string): Candidate[] {
  if (!stats) return [];
  const middle = middleLines(stats);
  const out: Candidate[] = [];
  for (const [market, p] of Object.entries(stats)) {
    const family = market.split(":")[0];
    const kind: ForgeMarket = family === "corners" ? "corners" : "shots";
    if (!allowed.has(kind) || !(p >= ALL_LINES_MIN && p <= ALL_LINES_MAX)) continue;
    const ou = market.match(/^(corners|shots|sot):(?:(home|away):)?(over|under):(\d+(?:\.\d+)?)$/);
    if (ou) {
      const mid = middle.get(ou[2] ? `${ou[1]}:${ou[2]}` : ou[1]);
      const line = Number(ou[4]);
      const reach = STAT_LINE_REACH[ou[1]] ?? 2;
      if (mid !== undefined && Math.abs(line - mid) > reach) continue;
    }
    const label = friendlyLabel(market, home, away, sweetSpotLabel(market));
    out.push({ picks: [{ market, label }], market, label, probability: p, fairOdds: 1 / p });
  }
  return out;
}

/** Every selection Forge may consider for one fixture, singles and combos. */
export function candidatesFor(p: Prediction, opts: CandidateOptions, stats?: Readonly<Record<string, number>>): Candidate[] {
  const home = p.match.home.name;
  const away = p.match.away.name;
  const allowed = new Set(opts.markets.filter((m) => m !== "handicap" || opts.allowHandicap));

  const singles = p.picks.filter((pk) => {
    // Corners and shots come from statCandidates, tested lines only.
    if (isStatMarket(pk.market)) return false;
    const fm = GROUP_MARKET[pk.group];
    if (!fm || !allowed.has(fm)) return false;
    // Whole and quarter handicap lines can push or half-win; keep the slip binary.
    if (fm === "handicap" && Math.abs((Number(pk.market.split(":")[2]) * 2) % 2) !== 1) return false;
    if (isPausedPick(pk.market, opts.surface)) return false;
    return pk.probability >= 0.12 && pk.fairOdds >= 1.04;
  });

  const out: Candidate[] = singles.map((pk) => ({
    picks: [{ market: pk.market, label: friendlyLabel(pk.market, home, away, pk.label) }],
    market: pk.market,
    label: friendlyLabel(pk.market, home, away, pk.label),
    probability: pk.probability,
    fairOdds: pk.fairOdds,
  }));

  if (opts.picksPerGame >= 2) {
    // The likeliest few in each family, paired across families: a result with
    // a goals line or GG/NG. Two lines from one family are either redundant or
    // contradictory.
    const byFamily = new Map<Family, ModelPick[]>();
    for (const pk of singles) {
      const fam = FAMILY[GROUP_MARKET[pk.group] as ForgeMarket];
      const list = byFamily.get(fam) ?? [];
      list.push(pk);
      byFamily.set(fam, list);
    }
    const tops = [...byFamily.values()].map((list) =>
      [...list].sort((a, b) => b.probability - a.probability).slice(0, 4),
    );
    const grid = gridFor(p);
    const combos: ModelPick[][] = [];
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        for (const a of tops[i]) for (const b of tops[j]) combos.push([a, b]);
        if (opts.picksPerGame >= 3) {
          for (let k = j + 1; k < tops.length; k++) {
            for (const a of tops[i]) for (const b of tops[j]) for (const c of tops[k]) combos.push([a, b, c]);
          }
        }
      }
    }
    for (const parts of combos) {
      const markets = parts.map((pk) => pk.market);
      const probability = jointProbability(grid, markets);
      if (probability < 0.12) continue;
      // A combo that's barely less likely than its weakest part adds nothing.
      if (probability > Math.min(...parts.map((pk) => pk.probability)) - 0.02) continue;
      out.push({
        picks: parts.map((pk) => ({ market: pk.market, label: friendlyLabel(pk.market, home, away, pk.label) })),
        market: `${COMBO_PREFIX}${markets.join("+")}`,
        label: parts.map((pk) => shortPart(pk.market, home, away, pk.label)).join(" & "),
        probability,
        fairOdds: 1 / probability,
      });
    }
  }
  const statLegs = opts.statLines === "all" ? allStatCandidates(stats, allowed, home, away) : statCandidates(stats, allowed);
  return [...out, ...statLegs];
}

/* -------------------------------------------------------------- selection */

export interface PoolEntry {
  prediction: Prediction;
  candidates: Candidate[];
}

/** A small seeded generator so "Generate again" gives a different, reproducible slip. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toLeg(entry: PoolEntry, c: Candidate): ForgeLeg {
  const p = entry.prediction;
  return {
    matchId: p.match.id,
    fixture: `${p.match.home.name} v ${p.match.away.name}`,
    homeName: p.match.home.name,
    awayName: p.match.away.name,
    league: p.match.league.name,
    leagueCode: p.match.league.code,
    kickoff: p.match.kickoff,
    picks: c.picks,
    market: c.market,
    label: c.label,
    probability: c.probability,
    fairOdds: c.fairOdds,
    price: c.price ?? null,
    reason: p.insights[0]?.text ?? null,
    dataQuality: Math.round(p.model.dataQuality),
  };
}

export interface ForgeRequestState {
  /** Legs the user kept: kept as-is if the fixture is still in the pool. */
  locked: { matchId: string; market: string }[];
  /** Games the user removed from this slip, never offered again. */
  removed: string[];
  /** Games on the previous slip, nudged down so "Generate again" varies. */
  avoid: string[];
  seed: number;
}

export interface ForgeResult {
  legs: ForgeLeg[];
  /** Ready-made replacements for Swap, best first. */
  bench: ForgeLeg[];
  /** Kept legs that couldn't be kept (kicked off, or no longer offered). */
  dropped: string[];
  /** Why the slip falls short of what was asked for, in plain words (forge-solve.ts). */
  notes?: string[];
}

/** A typical SportyBet margin on one pick, for a pick whose own price we can't read. */
export const ESTIMATED_MARGIN = 1.07;

/**
 * The price a pick counts at while a combo is being built: SportyBet's own
 * where its board lists it, else the model's fair odds less a typical
 * margin. Building on fair odds alone published codes well short of their
 * names once SportyBet's prices were attached (a "10" loaded at 6.22).
 */
export function oddsOf(c: { price?: number | null; fairOdds: number }): number {
  return c.price && c.price > 1 ? c.price : c.fairOdds / ESTIMATED_MARGIN;
}

/**
 * The Code Hub's builder: fits every leg to an even share of the target, at
 * the prices the code will load at (oddsOf). Forge itself builds with
 * forge-solve.ts.
 */
export function forge(pool: PoolEntry[], settings: ForgeSettings, state: ForgeRequestState): ForgeResult {
  const bounds = RISK_BOUNDS[settings.risk];
  const rand = seededRandom(state.seed);
  const removed = new Set(state.removed);
  const avoid = new Set(state.avoid);
  const byId = new Map(pool.map((e) => [e.prediction.match.id, e]));

  // Kept legs first, recomputed from today's numbers rather than trusted from the browser.
  const legs: ForgeLeg[] = [];
  const dropped: string[] = [];
  for (const lock of state.locked) {
    const entry = byId.get(lock.matchId);
    const c = entry?.candidates.find((x) => x.market === lock.market);
    if (entry && c) legs.push(toLeg(entry, c));
    else dropped.push(lock.matchId);
  }
  const used = new Set(legs.map((l) => l.matchId));

  // Twelve for a person's combo (parseSettings); the hub's longest code may take thirteen.
  const wanted = Math.max(1, Math.min(13, Math.round(settings.games)));
  const target = Math.max(1.05, settings.targetOdds);
  const lockedOdds = legs.reduce((o, l) => o * oddsOf(l), 1);
  const open = Math.max(0, wanted - legs.length);
  const legTarget = open > 0 ? clamp(Math.pow(target / lockedOdds, 1 / open), bounds.min, bounds.max) : bounds.min;

  const eligible = (c: Candidate) =>
    oddsOf(c) >= bounds.min * 0.97 && oddsOf(c) <= bounds.max * 1.03 && c.probability >= bounds.minProb;

  // Each fixture's best fit for the per-leg target. Jitter only breaks
  // near-ties, so a regenerated slip changes without getting worse.
  const scored = pool
    .filter((e) => !used.has(e.prediction.match.id) && !removed.has(e.prediction.match.id))
    .flatMap((entry) => {
      const options = entry.candidates.filter(eligible);
      if (options.length === 0) return [];
      const dq = entry.prediction.model.dataQuality / 100;
      const ranked = options
        .map((c) => ({
          c,
          cost:
            Math.abs(Math.log(oddsOf(c)) - Math.log(legTarget)) +
            0.35 * (1 - dq) +
            (avoid.has(entry.prediction.match.id) ? 0.3 : 0) +
            rand() * 0.06,
        }))
        .sort((a, b) => a.cost - b.cost);
      return [{ entry, best: ranked[0].c, cost: ranked[0].cost }];
    })
    .sort((a, b) => a.cost - b.cost);

  // Greedy fill with a gentle push away from stacking one league on one day,
  // whose results move together.
  const sameDay = new Map<string, number>();
  const dayKey = (e: PoolEntry) => `${e.prediction.match.league.code}|${e.prediction.match.kickoff.slice(0, 10)}`;
  for (const l of legs) sameDay.set(`${l.leagueCode}|${l.kickoff.slice(0, 10)}`, (sameDay.get(`${l.leagueCode}|${l.kickoff.slice(0, 10)}`) ?? 0) + 1);

  const remaining = [...scored];
  const chosen: { entry: PoolEntry; c: Candidate }[] = [];
  while (chosen.length < open && remaining.length > 0) {
    let bestIdx = 0;
    let bestCost = Infinity;
    remaining.forEach((r, i) => {
      const cost = r.cost + 0.12 * (sameDay.get(dayKey(r.entry)) ?? 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    });
    const [pick] = remaining.splice(bestIdx, 1);
    chosen.push({ entry: pick.entry, c: pick.best });
    sameDay.set(dayKey(pick.entry), (sameDay.get(dayKey(pick.entry)) ?? 0) + 1);
  }

  // Then nudge each open leg toward the total the user asked for.
  for (let pass = 0; pass < 3; pass++) {
    for (const slot of chosen) {
      const others =
        lockedOdds * chosen.reduce((o, s) => (s === slot ? o : o * oddsOf(s.c)), 1);
      let best = slot.c;
      let bestGap = Math.abs(Math.log(others * oddsOf(slot.c)) - Math.log(target));
      for (const c of slot.entry.candidates.filter(eligible)) {
        const gap = Math.abs(Math.log(others * oddsOf(c)) - Math.log(target));
        if (gap < bestGap - 0.01) {
          best = c;
          bestGap = gap;
        }
      }
      slot.c = best;
    }
  }

  for (const s of chosen) legs.push(toLeg(s.entry, s.c));
  legs.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  const bench = remaining.slice(0, 10).map((r) => toLeg(r.entry, r.best));
  return { legs, bench, dropped };
}

/* ------------------------------------------------------------ best first */

/** The least likely leg a best-first build takes, by how big a price was asked for. */
export function legFloorFor(target: number): number {
  return target <= 2.5 ? 0.6 : target <= 8 ? 0.5 : 0.35;
}

/** Shorter than this a leg barely moves the price and is not worth its risk of a shock. */
const BEST_MIN_LEG_ODDS = 1.15;
/** A build may finish a little past the price asked for, never far past it. */
const BEST_OVERSHOOT = 1.35;
/** And counts as there once it is this close below it. */
const BEST_REACHED = 0.95;

/**
 * How much a leg is worth leading with: its chance, a little more when it is
 * the model's own pick for the game (tested as a pick, not just a number), a
 * little less on thin data, and less again for a game the last slip used, so
 * "Generate again" brings the next best rather than the same slip.
 */
function legQuality(entry: PoolEntry, c: Candidate, avoided: boolean): number {
  const head = entry.prediction.topPick?.market === c.market ? 0.02 : 0;
  const dq = entry.prediction.model.dataQuality / 100;
  return c.probability + head - 0.06 * (1 - dq) - (avoided ? 0.05 : 0);
}

/**
 * Forge's builder: the strongest read on the card first, then the next
 * strongest, until the slip reaches the price asked for. Each game offers its
 * single best leg; a game whose best leg would carry the slip far past the
 * price offers a shorter one instead, or is skipped. As few games as it takes,
 * up to settings.games.
 *
 * Where forge() (still the hub's builder) fits every leg to an even share of
 * the target, this never takes a weaker read to make the arithmetic tidy.
 */
export function forgeBest(pool: PoolEntry[], settings: ForgeSettings, state: ForgeRequestState): ForgeResult {
  const removed = new Set(state.removed);
  const avoid = new Set(state.avoid);
  const byId = new Map(pool.map((e) => [e.prediction.match.id, e]));

  const legs: ForgeLeg[] = [];
  const dropped: string[] = [];
  for (const lock of state.locked) {
    const entry = byId.get(lock.matchId);
    const c = entry?.candidates.find((x) => x.market === lock.market);
    if (entry && c) legs.push(toLeg(entry, c));
    else dropped.push(lock.matchId);
  }
  const used = new Set(legs.map((l) => l.matchId));

  const target = Math.max(1.05, settings.targetOdds);
  const maxGames = Math.max(1, Math.min(13, Math.round(settings.games)));
  const floor = legFloorFor(target);
  // The shortest leg that can still reach the price inside the game limit: a
  // big price needs every leg to carry some of it, or the strong short legs run
  // out first (a 20 at 1.2 a leg would take 17 games).
  const minOdds = Math.max(BEST_MIN_LEG_ODDS, Math.pow(target, 1 / maxGames) * 1.02);
  const usable = (c: Candidate) => c.fairOdds >= minOdds && c.probability >= floor;

  const ranked = pool
    .filter((e) => !used.has(e.prediction.match.id) && !removed.has(e.prediction.match.id))
    .flatMap((entry) => {
      const avoided = avoid.has(entry.prediction.match.id);
      const options = entry.candidates
        .filter(usable)
        .map((c) => ({ c, q: legQuality(entry, c, avoided) }))
        .sort((a, b) => b.q - a.q);
      return options.length ? [{ entry, options }] : [];
    })
    .sort((a, b) => b.options[0].q - a.options[0].q);

  let odds = legs.reduce((o, l) => o * l.fairOdds, 1);
  const taken = new Set<string>();
  for (const r of ranked) {
    if (legs.length >= maxGames || odds >= BEST_REACHED * target) break;
    // The game's best leg, or its best that keeps the slip near the price.
    const fit = r.options.find((o) => odds * o.c.fairOdds <= target * BEST_OVERSHOOT);
    if (!fit) continue;
    legs.push(toLeg(r.entry, fit.c));
    taken.add(r.entry.prediction.match.id);
    odds *= fit.c.fairOdds;
  }

  legs.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const bench = ranked
    .filter((r) => !taken.has(r.entry.prediction.match.id))
    .slice(0, 10)
    .map((r) => toLeg(r.entry, r.options[0].c));
  return { legs, bench, dropped };
}

/** Swap for best-first slips: the strongest bench leg not already on the slip (the bench is best first). */
export function nextBest(bench: ForgeLeg[], onSlip: Set<string>): ForgeLeg | null {
  return bench.find((b) => !onSlip.has(b.matchId)) ?? null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/* ---------------------------------------------------------------- totals */

/** The price a leg counts at on the slip: SportyBet's where listed, else the model's fair odds. */
export const legOdds = (l: Pick<ForgeLeg, "price" | "fairOdds">) => l.price ?? l.fairOdds;

export function slipTotals(legs: ForgeLeg[], stake: number) {
  const odds = legs.reduce((o, l) => o * legOdds(l), 1);
  const probability = legs.reduce((p, l) => p * l.probability, 1);
  return {
    odds: legs.length ? odds : 0,
    probability: legs.length ? probability : 0,
    returns: legs.length ? Math.round(stake * odds) : 0,
    picks: legs.reduce((n, l) => n + l.picks.length, 0),
    priced: legs.filter((l) => l.price !== null).length,
  };
}

/** "about 1 in 5" — how a chance reads to someone who doesn't think in percentages. */
export function oneIn(probability: number): string {
  if (probability <= 0) return "";
  const n = 1 / probability;
  if (n < 1.15) return "almost every time";
  if (n < 10) return `about 1 in ${Math.round(n * 2) / 2}`.replace(".5", "½");
  return `about 1 in ${Math.round(n)}`;
}

/** Best replacement for a leg: the bench game whose odds sit closest to the one going. */
export function bestSwap(leg: ForgeLeg, bench: ForgeLeg[], onSlip: Set<string>): ForgeLeg | null {
  const options = bench.filter((b) => !onSlip.has(b.matchId));
  if (options.length === 0) return null;
  return options.reduce((best, b) =>
    Math.abs(Math.log(legOdds(b)) - Math.log(legOdds(leg))) < Math.abs(Math.log(legOdds(best)) - Math.log(legOdds(leg)))
      ? b
      : best,
  );
}

/* --------------------------------------------------------------- request */

export const FORGE_GUEST_TOTAL = 2;
export const FORGE_FREE_DAILY = 5;
/** Fair-use ceiling behind "unlimited" on paid plans. */
export const FORGE_PAID_DAILY = 100;

export interface ForgeRequest {
  settings: ForgeSettings;
  state: ForgeRequestState;
}

const ID = /^[a-z]+:[\w.-]{1,60}$/i;
const ids = (v: unknown, max = 20): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, max) : [];

/** Validates a Forge request, filling anything missing or out of range from the defaults. */
export function parseForgeRequest(body: unknown): ForgeRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const s = (b.settings && typeof b.settings === "object" ? b.settings : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

  const risk = (["safe", "balanced", "risky"] as const).includes(s.risk as ForgeRisk) ? (s.risk as ForgeRisk) : DEFAULT_SETTINGS.risk;
  const markets = Array.isArray(s.markets)
    ? FORGE_MARKETS.map((m) => m.id).filter((id) => (s.markets as unknown[]).includes(id))
    : DEFAULT_SETTINGS.markets;
  const picks = s.picksPerGame === 1 || s.picksPerGame === 2 || s.picksPerGame === 3 ? s.picksPerGame : DEFAULT_SETTINGS.picksPerGame;
  const when = FORGE_WHEN.some((w) => w.id === s.when) ? (s.when as ForgeWhen) : DEFAULT_SETTINGS.when;
  const leagues = typeof s.leagues === "string" && /^(all|mine|[a-z0-9-]{2,40})$/.test(s.leagues) ? s.leagues : "all";

  const st = (b.state && typeof b.state === "object" ? b.state : {}) as Record<string, unknown>;
  const locked = Array.isArray(st.locked)
    ? st.locked
        .flatMap((l) => {
          const o = l as Record<string, unknown>;
          return typeof o?.matchId === "string" && ID.test(o.matchId) && typeof o.market === "string" && o.market.length <= 80
            ? [{ matchId: o.matchId, market: o.market }]
            : [];
        })
        .slice(0, 12)
    : [];

  return {
    settings: {
      risk,
      targetOdds: Math.round(num(s.targetOdds, 1.2, 1000, DEFAULT_SETTINGS.targetOdds) * 100) / 100,
      games: Math.round(num(s.games, 1, 12, DEFAULT_SETTINGS.games)),
      picksPerGame: picks,
      markets: markets.length ? markets : DEFAULT_SETTINGS.markets,
      when,
      leagues,
      stake: Math.round(num(s.stake, 0, 10_000_000, DEFAULT_SETTINGS.stake)),
    },
    state: {
      locked,
      removed: ids(st.removed, 40),
      avoid: ids(st.avoid, 20),
      seed: Math.floor(num(st.seed, 0, 2 ** 31, 1)),
    },
  };
}
