/**
 * Forge's builder: exactly the number of games asked for, with the combined
 * price inside a few percent of the one asked for.
 *
 * It replaces forgeBest, which stopped as soon as the price was reached (so
 * "10 games" gave 4 when the price was small) and accepted anything from 95%
 * to 135% of it. Here the games are chosen first, strongest reads first, then
 * one leg per game is chosen to land on the price: a short line where the
 * total would run long, a longer one where it would fall short. Every leg
 * still clears the build's floor (legFloorFor), so hitting the number never
 * means taking a read we wouldn't stand behind.
 *
 * Pure, like forge.ts, so the tests and the server agree.
 */

import {
  legFloorFor,
  seededRandom,
  toLeg,
  type Candidate,
  type ForgeLeg,
  type ForgeMarket,
  type ForgeRequestState,
  type ForgeResult,
  type ForgeSettings,
  type PoolEntry,
} from "@/lib/forge";

/**
 * Shorter than this a leg barely moves the price and is not worth its risk of
 * a shock. A long slip at a small price is the exception: ten games at 5.00
 * average 1.17 a leg, so the floor comes down with the average leg the slip
 * needs (95% of it, never below 1.05).
 */
export const MIN_LEG_ODDS = 1.15;
const LOWEST_LEG_ODDS = 1.05;

export function minLegOdds(target: number, games: number): number {
  const average = Math.pow(Math.max(1.05, target), 1 / Math.max(1, games));
  return Math.min(MIN_LEG_ODDS, Math.max(LOWEST_LEG_ODDS, average * 0.95));
}
/** How close to the price asked for counts as on it: 5% either way. */
export const PRICE_BAND = 0.05;
/** Below this price the band is absolute instead (2.10 to 2.30 for 2.20). */
const SMALL_TARGET = 3;
const SMALL_BAND = 0.1;
/** Options per game the search looks at, best first; more change nothing in practice. */
const OPTIONS_PER_GAME = 16;
/** Log-price resolution of the search: 0.2%, so thirteen legs drift at most 1.3% before the exact check. */
const STEP = 0.002;
/** Swap attempts when the chosen games can't reach the price between them. */
const SWAP_TRIES = 12;

const STAT_MARKETS: ForgeMarket[] = ["corners", "shots"];
const isStatLeg = (market: string) => /^(corners|shots|sot|bookings|cards):/.test(market);

export interface SolveOption {
  c: Candidate;
  /** ln of the price the slip shows for this leg: SportyBet's where listed, else the fair price. */
  lo: number;
  q: number;
}

export interface SolveGame {
  entry: PoolEntry;
  opts: SolveOption[];
}

/** The price a candidate counts at: the board's where we have it, so the total shown is the total aimed at. */
const oddsOf = (c: Candidate) => (c.price && c.price > 1 ? c.price : c.fairOdds);

/**
 * How much a leg is worth leading with: its chance, a little more when it is
 * the model's own pick for the game, a little less on thin data, and less
 * again for a game the last slip used, so "Generate again" varies.
 */
function quality(entry: PoolEntry, c: Candidate, avoided: boolean): number {
  const head = entry.prediction.topPick?.market === c.market ? 0.02 : 0;
  const dq = entry.prediction.model.dataQuality / 100;
  return c.probability + head - 0.06 * (1 - dq) - (avoided ? 0.05 : 0);
}

/** The band [lo, hi] around a target price, in prices. */
export function priceBand(target: number): [number, number] {
  return target < SMALL_TARGET ? [target - SMALL_BAND, target + SMALL_BAND] : [target * (1 - PRICE_BAND), target * (1 + PRICE_BAND)];
}

export interface Solution {
  /** Index into each game's opts, one per game. */
  choice: number[];
  odds: number;
  inBand: boolean;
}

/**
 * One option per game so the product of prices lands on `target` (times what
 * is already on the slip). Inside the band, the highest total quality wins;
 * if nothing lands inside it, the closest total does.
 *
 * Dynamic programming over log-price buckets: games × options × buckets, a
 * few hundred thousand steps for a full slip.
 */
export function solveOptions(
  games: readonly { opts: readonly { lo: number; q: number }[] }[],
  target: number,
  already = 1,
): Solution | null {
  if (games.length === 0) return null;
  const goal = Math.log(target / already);
  const [bandLo, bandHi] = priceBand(target);
  const lo = Math.log(bandLo / already);
  const hi = Math.log(bandHi / already);

  // Every leg's price is above 1, so every log-price is positive and the
  // running sum climbs from zero.
  const maxSum = games.reduce((sum, g) => sum + Math.max(...g.opts.map((o) => o.lo)), 0);
  const width = Math.ceil(maxSum / STEP) + games.length + 2;
  let best = new Float64Array(width).fill(-Infinity);
  best[0] = 0;
  const fromOpt: Int16Array[] = [];
  const fromBucket: Int32Array[] = [];

  for (const g of games) {
    const next = new Float64Array(width).fill(-Infinity);
    const opt = new Int16Array(width).fill(-1);
    const prev = new Int32Array(width).fill(-1);
    for (let b = 0; b < width; b++) {
      if (best[b] === -Infinity) continue;
      g.opts.forEach((o, k) => {
        const nb = b + Math.round(o.lo / STEP);
        if (nb < 0 || nb >= width) return;
        const v = best[b] + o.q;
        if (v > next[nb]) {
          next[nb] = v;
          opt[nb] = k;
          prev[nb] = b;
        }
      });
    }
    fromOpt.push(opt);
    fromBucket.push(prev);
    best = next;
  }

  const sumAt = (b: number) => b * STEP;
  let pickB = -1;
  let pickScore = -Infinity;
  for (let b = 0; b < width; b++) {
    if (best[b] === -Infinity) continue;
    const s = sumAt(b);
    if (s >= lo - STEP && s <= hi + STEP && best[b] > pickScore) {
      pickScore = best[b];
      pickB = b;
    }
  }
  if (pickB < 0) {
    // Nothing in the band: the closest total, the stronger slip on a tie.
    let gap = Infinity;
    for (let b = 0; b < width; b++) {
      if (best[b] === -Infinity) continue;
      const d = Math.abs(sumAt(b) - goal);
      if (d < gap - 1e-9 || (Math.abs(d - gap) < 1e-9 && best[b] > best[pickB])) {
        gap = d;
        pickB = b;
      }
    }
  }
  if (pickB < 0) return null;

  const choice = new Array<number>(games.length);
  let b = pickB;
  for (let i = games.length - 1; i >= 0; i--) {
    choice[i] = fromOpt[i][b];
    b = fromBucket[i][b];
  }
  const odds = already * games.reduce((o, g, i) => o * Math.exp(g.opts[choice[i]].lo), 1);
  return { choice, odds, inBand: odds >= bandLo - 1e-9 && odds <= bandHi + 1e-9 };
}

/** "Premier League, La Liga and 3 more". */
function leagueList(names: string[]): string {
  const uniq = [...new Set(names)];
  if (uniq.length <= 3) return uniq.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${uniq.slice(0, 3).join(", ")} and ${uniq.length - 3} more`;
}

const fmt = (x: number) => x.toFixed(x < 10 ? 2 : x < 100 ? 1 : 0);

/**
 * Builds the slip: the kept legs, then the strongest `games` games on the
 * card for the markets chosen, then one leg each landing on the price.
 */
export function forgeSolve(pool: PoolEntry[], settings: ForgeSettings, state: ForgeRequestState): ForgeResult {
  const removed = new Set(state.removed);
  const avoid = new Set(state.avoid);
  const byId = new Map(pool.map((e) => [e.prediction.match.id, e]));
  const rand = seededRandom(state.seed);
  const notes: string[] = [];

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
  const wanted = Math.max(1, Math.min(13, Math.round(settings.games)));
  const open = Math.max(0, wanted - legs.length);
  const already = legs.reduce((o, l) => o * (l.price ?? l.fairOdds), 1);
  const floor = legFloorFor(target);
  const shortest = minLegOdds(target / already, Math.max(1, open));

  // Every game's usable legs, strongest first. The tiny jitter only breaks
  // near-ties, so "Generate again" changes the slip without weakening it.
  const games: SolveGame[] = pool
    .filter((e) => !used.has(e.prediction.match.id) && !removed.has(e.prediction.match.id))
    .flatMap((entry) => {
      const avoided = avoid.has(entry.prediction.match.id);
      const opts = entry.candidates
        .filter((c) => c.probability >= floor && oddsOf(c) >= shortest)
        .map((c) => ({ c, lo: Math.log(oddsOf(c)), q: quality(entry, c, avoided) + rand() * 0.004 }))
        .sort((a, b) => b.q - a.q)
        .slice(0, OPTIONS_PER_GAME);
      return opts.length ? [{ entry, opts }] : [];
    });
  const strength = (g: SolveGame) => g.opts[0].q;

  // Corners and shots chosen alongside other markets get a fair share of the
  // games: otherwise a double chance at 85% beats a corners line at 80% on
  // every game, and a "corners" combo comes back without a corner in it.
  const statChosen = settings.markets.filter((m) => STAT_MARKETS.includes(m));
  const otherChosen = settings.markets.filter((m) => !STAT_MARKETS.includes(m));
  const statGames = games.filter((g) => g.opts.some((o) => isStatLeg(o.c.market)));
  let statQuota = 0;
  if (statChosen.length && otherChosen.length) {
    statQuota = Math.min(statGames.length, Math.ceil(open * Math.max(0.3, statChosen.length / settings.markets.length)));
  }

  const ranked = [...games].sort((a, b) => strength(b) - strength(a));
  const chosen: SolveGame[] = [];
  const taken = new Set<string>();
  const takeGame = (g: SolveGame, opts = g.opts) => {
    chosen.push({ entry: g.entry, opts });
    taken.add(g.entry.prediction.match.id);
  };
  if (statQuota > 0) {
    const byStat = [...statGames].sort(
      (a, b) => Math.max(...b.opts.filter((o) => isStatLeg(o.c.market)).map((o) => o.q)) - Math.max(...a.opts.filter((o) => isStatLeg(o.c.market)).map((o) => o.q)),
    );
    // A quota game offers only its corners and shots legs, or the quota is a suggestion.
    for (const g of byStat.slice(0, statQuota)) takeGame(g, g.opts.filter((o) => isStatLeg(o.c.market)));
  }
  for (const g of ranked) {
    if (chosen.length >= open) break;
    if (!taken.has(g.entry.prediction.match.id)) takeGame(g);
  }

  if (chosen.length < open) {
    const what = statChosen.length && !otherChosen.length ? `${statChosen.join(" or ")} data` : "a pick that fits these settings";
    const leagues = statChosen.length ? ` (${leagueList(statGames.map((g) => g.entry.prediction.match.league.name))})` : "";
    notes.push(
      chosen.length + legs.length === 0
        ? `No game in this window has ${what}.`
        : `Only ${chosen.length + legs.length} games in this window have ${what}${chosen.length ? leagues : ""}, so the combo has ${chosen.length + legs.length} instead of ${wanted}.`,
    );
  }

  let sol = solveOptions(chosen, target, already);

  // The chosen games can't reach the price between them: swap the game that
  // holds the slip back most for the strongest unused game that pushes the
  // right way, and solve again.
  for (let tries = 0; sol && !sol.inBand && tries < SWAP_TRIES; tries++) {
    const short = sol.odds < target;
    const spare = ranked.filter((g) => !taken.has(g.entry.prediction.match.id));
    if (!spare.length) break;
    const reach = (g: SolveGame) => (short ? Math.max(...g.opts.map((o) => o.lo)) : -Math.min(...g.opts.map((o) => o.lo)));
    const worst = chosen.reduce((w, g, i) => (reach(g) < reach(chosen[w]) ? i : w), 0);
    const better = spare.find((g) => reach(g) > reach(chosen[worst]) + 0.01);
    if (!better) break;
    taken.delete(chosen[worst].entry.prediction.match.id);
    chosen[worst] = { entry: better.entry, opts: better.opts };
    taken.add(better.entry.prediction.match.id);
    const next = solveOptions(chosen, target, already);
    if (!next) break;
    sol = next;
  }

  if (sol) {
    chosen.forEach((g, i) => legs.push(toLeg(g.entry, g.opts[sol!.choice[i]].c)));
    if (!sol.inBand) {
      notes.push(
        sol.odds < target
          ? `${fmt(sol.odds)} is as close to ${fmt(target)} as ${legs.length} games get without taking picks weaker than this price allows. Add games or lower the price.`
          : `${fmt(sol.odds)} is as close to ${fmt(target)} as ${legs.length} games get: even their shortest picks add up past it. Use fewer games or a bigger price.`,
      );
    }
  }

  legs.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const bench = ranked
    .filter((g) => !taken.has(g.entry.prediction.match.id))
    .slice(0, 10)
    .map((g) => toLeg(g.entry, g.opts[0].c));
  return { legs, bench, dropped, notes };
}

/**
 * Up to `size` fixtures taken a league at a time, earliest first within each.
 * A busy weekend lists far more games than the pool holds; cutting the feed
 * in its own order filled the pool from whichever leagues it lists first, so
 * a corners combo could find no game from a league that has corners data.
 */
export function balancedByLeague<T extends { kickoff: string; league: { code?: string | null } }>(matches: readonly T[], size: number): T[] {
  if (matches.length <= size) return [...matches];
  const byLeague = new Map<string, T[]>();
  for (const m of [...matches].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))) {
    const key = m.league.code ?? "";
    byLeague.set(key, [...(byLeague.get(key) ?? []), m]);
  }
  const queues = [...byLeague.values()];
  const out: T[] = [];
  for (let round = 0; out.length < size; round++) {
    let added = false;
    for (const q of queues) {
      if (round < q.length && out.length < size) {
        out.push(q[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}
