/**
 * The model's chance for any single leg SportyBet can carry, from the right
 * grid: the scoreline grid for goals markets, the count grid for corners,
 * shots, shots on target and bookings.
 *
 * Settles the way SportyBet does. A whole line ("hcp=-2", "total=9") gives
 * the stake back on the line; a quarter line splits the stake across the two
 * lines beside it, so it can half-win or half-lose. A code survives a leg
 * that pushes or half-loses (the leg's price drops, the code does not die),
 * which is why `survive` and not `win` is what a code's chance multiplies.
 *
 * Pure: callers bring the grids (forge.ts gridFor, stat-markets-service.ts
 * statGridsFor).
 */
import { evaluatePick, evaluateStatPick, type PickResult } from "@/lib/settlement";
import { fromRaw } from "@/lib/odds/markets";
import { rawGrader } from "@/lib/odds/raw-grades";

export type StatFamily = "corners" | "shots" | "sot" | "bookings";
const STAT_FAMILIES: readonly StatFamily[] = ["corners", "shots", "sot", "bookings"];

export interface PricingContext {
  /** P(home goals = i, away goals = j). */
  goals?: number[][];
  /** P(home count = i, away count = j), per count family. */
  stats?: Partial<Record<StatFamily, number[][]>>;
  /**
   * Each half's own score grid (halves.ts halfGrids), for markets settled on
   * the halves: half-time/full-time, both halves over 1.5, second-half lines.
   */
  halves?: { first: number[][]; second: number[][] };
}

export interface LegPrice {
  win: number;
  halfWin: number;
  push: number;
  halfLose: number;
  lose: number;
  /** Not a full loss: what a code's chance multiplies. */
  survive: number;
}

export type LegOutcome = "win" | "halfWin" | "push" | "halfLose" | "lose";

const COMBO = "combo:";

export function statFamilyOf(market: string): StatFamily | null {
  const family = market.split(":")[0] as StatFamily;
  return STAT_FAMILIES.includes(family) ? family : null;
}

/** The leg's line, when it is the last part of the id ("ah:home:-0.75", "corners:over:9.5"). */
function lineOf(market: string): number | null {
  if (!/^(ah|ou|tg|corners|shots|sot|bookings):/.test(market)) return null;
  if (/:most:/.test(market)) return null;
  const last = market.split(":").pop()!;
  return /^[+-]?\d+(\.\d+)?$/.test(last) ? Number(last) : null;
}

/** The same leg at another line, written the way the family writes lines. */
function atLine(market: string, line: number): string {
  const parts = market.split(":");
  const signedLine = /^(ah|corners|shots|sot|bookings)$/.test(parts[0]) && parts.includes("hcp");
  const text = signedLine && line > 0 ? `+${line}` : String(line === 0 ? 0 : line);
  parts[parts.length - 1] = text;
  return parts.join(":");
}

const isQuarter = (line: number) => Math.abs((line * 4) % 2) === 1;

/** One leg against one result, split stake included; null when the market isn't one we price. */
export function gradeLeg(market: string, home: number, away: number): LegOutcome | null {
  const raw = fromRaw(market);
  if (raw) {
    const g = rawGrader(raw);
    return g?.scope === "ft" ? g.grade(home, away) : null;
  }
  const base = (m: string): PickResult | null => (statFamilyOf(m) ? evaluateStatPick(m, home, away) : evaluatePick(m, home, away));
  const line = lineOf(market);
  // evaluatePick folds a quarter handicap into win/push; split it here so a
  // half-loss is told apart from a refund. Over/under had no quarter rule.
  if (line !== null && isQuarter(line)) {
    const a = base(atLine(market, line - 0.25));
    const b = base(atLine(market, line + 0.25));
    if (!a || !b) return null;
    if (a === b) return a;
    const pair = new Set([a, b]);
    if (pair.has("win") && pair.has("push")) return "halfWin";
    if (pair.has("lose") && pair.has("push")) return "halfLose";
    return null; // a quarter line's neighbours are half a goal apart: never win and lose
  }
  return base(market);
}

const empty = (): LegPrice => ({ win: 0, halfWin: 0, push: 0, halfLose: 0, lose: 0, survive: 0 });

function sumGrid(grid: number[][], grade: (i: number, j: number) => LegOutcome | null): LegPrice | null {
  const out = empty();
  let seen = false;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      if (!(p > 0)) continue;
      const g = grade(i, j);
      if (!g) return null;
      out[g] += p;
      seen = true;
    }
  }
  if (!seen) return null;
  out.survive = out.win + out.halfWin + out.push + out.halfLose;
  return out;
}

/** A leg graded on both halves' scores; the final score is their sum. */
type HalvesGrade = (h1: number, a1: number, h2: number, a2: number) => LegOutcome | null;

/**
 * How a leg (or a same-game combo's part) settles, and whether it needs the
 * halves' scores; null for one priced off a count grid, or not priced at all.
 */
function goalsGrader(market: string): { halves: boolean; grade: HalvesGrade } | null {
  const raw = fromRaw(market);
  if (raw) {
    const g = rawGrader(raw);
    if (!g || g.scope === "corners") return null;
    if (g.scope === "halves") return { halves: true, grade: g.grade };
    return { halves: false, grade: (h1, a1, h2, a2) => g.grade(h1 + h2, a1 + a2) };
  }
  if (statFamilyOf(market)) return null;
  return { halves: false, grade: (h1, a1, h2, a2) => gradeLeg(market, h1 + h2, a1 + a2) };
}

/** Every pair of half-time and second-half scores, weighted as the halves are independent. */
function sumHalves(halves: { first: number[][]; second: number[][] }, grade: HalvesGrade): LegPrice | null {
  const { first, second } = halves;
  const out = empty();
  let seen = false;
  for (let h1 = 0; h1 < first.length; h1++) {
    for (let a1 = 0; a1 < first[h1].length; a1++) {
      const p1 = first[h1][a1];
      if (!(p1 > 1e-9)) continue;
      for (let h2 = 0; h2 < second.length; h2++) {
        for (let a2 = 0; a2 < second[h2].length; a2++) {
          const p = p1 * second[h2][a2];
          if (!(p > 1e-12)) continue;
          const g = grade(h1, a1, h2, a2);
          if (!g) return null;
          out[g] += p;
          seen = true;
        }
      }
    }
  }
  if (!seen) return null;
  out.survive = out.win + out.halfWin + out.push + out.halfLose;
  return out;
}

/** Several legs that must all survive: wins outright only when every one wins. */
function together(gs: (LegOutcome | null)[]): LegOutcome | null {
  if (gs.some((g) => g === null)) return null;
  if (gs.every((g) => g === "win")) return "win";
  if (gs.some((g) => g === "lose")) return "lose";
  if (gs.some((g) => g === "halfLose")) return "halfLose";
  return gs.some((g) => g === "push") ? "push" : "halfWin";
}

/**
 * The leg's chance of each settlement, or null when it is not a market we
 * price or the grid it needs is missing (a competition with no corners
 * history, a stat family inside a same-game combo).
 *
 * Whole-match markets read the full-match grid. Markets settled on the
 * halves read the two half grids together, a little less exact on the final
 * score (no low-score correction), which is why only they use them.
 */
export function priceLeg(market: string, ctx: PricingContext): LegPrice | null {
  const parts = market.startsWith(COMBO) ? market.slice(COMBO.length).split("+") : [market];
  const raw = parts.length === 1 ? fromRaw(market) : null;
  const family = parts.length === 1 && !raw ? statFamilyOf(market) : null;
  if (family) {
    const grid = ctx.stats?.[family];
    return grid ? sumGrid(grid, (i, j) => gradeLeg(market, i, j)) : null;
  }
  const corners = raw && rawGrader(raw);
  if (corners && corners.scope === "corners") {
    const grid = ctx.stats?.corners;
    return grid ? sumGrid(grid, corners.grade) : null;
  }
  const graders = parts.map(goalsGrader);
  if (graders.some((g) => g === null)) return null;
  const all = graders as { halves: boolean; grade: HalvesGrade }[];
  const grade: HalvesGrade = (h1, a1, h2, a2) => (all.length === 1 ? all[0].grade(h1, a1, h2, a2) : together(all.map((g) => g.grade(h1, a1, h2, a2))));
  if (all.some((g) => g.halves)) return ctx.halves ? sumHalves(ctx.halves, grade) : null;
  // Whole-match legs only: the full-match grid, its final score split nowhere.
  return ctx.goals ? sumGrid(ctx.goals, (i, j) => grade(i, j, 0, 0)) : null;
}

/**
 * One leg against a finished game, half-time score included: what grades a
 * market settled on the halves. Null when it isn't one we can grade, or it
 * needs a half-time score that wasn't recorded.
 */
export function gradeLegFull(market: string, ft: { home: number; away: number }, ht?: { home: number; away: number } | null): LegOutcome | null {
  const parts = market.startsWith(COMBO) ? market.slice(COMBO.length).split("+") : [market];
  const graders = parts.map(goalsGrader);
  if (graders.some((g) => g === null)) return null;
  const all = graders as { halves: boolean; grade: HalvesGrade }[];
  if (all.some((g) => g.halves) && !ht) return null;
  const [h1, a1] = ht ? [ht.home, ht.away] : [0, 0];
  if (h1 > ft.home || a1 > ft.away) return null;
  const gs = all.map((g) => g.grade(h1, a1, ft.home - h1, ft.away - a1));
  return gs.length === 1 ? gs[0] : together(gs);
}

/** The refund and half-settled share, for "74% · 9% refund" beside a chance. */
export function refundShare(price: LegPrice): number {
  return price.push + price.halfWin + price.halfLose;
}

/** A count grid folded onto what a stat leg reads: the total, each side, and home minus away. */
interface Marginals {
  total: number[];
  home: number[];
  away: number[];
  /** Index d + offset is home minus away = d. */
  diff: number[];
  offset: number;
}

function marginalsOf(grid: number[][]): Marginals {
  const rows = grid.length;
  const cols = Math.max(0, ...grid.map((r) => r.length));
  const m: Marginals = { total: Array(rows + cols).fill(0), home: Array(rows).fill(0), away: Array(cols).fill(0), diff: Array(rows + cols).fill(0), offset: cols };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      if (!(p > 0)) continue;
      m.total[i + j] += p;
      m.home[i] += p;
      m.away[j] += p;
      m.diff[i - j + cols] += p;
    }
  }
  return m;
}

function sumMarginal(dist: number[], grade: (k: number) => LegOutcome | null): LegPrice | null {
  const out = empty();
  let seen = false;
  for (let k = 0; k < dist.length; k++) {
    const p = dist[k];
    if (!(p > 0)) continue;
    const g = grade(k);
    if (!g) return null;
    out[g] += p;
    seen = true;
  }
  if (!seen) return null;
  out.survive = out.win + out.halfWin + out.push + out.halfLose;
  return out;
}

/**
 * priceLeg for many corners, shots and shots-on-target legs on one game.
 *
 * Every stat leg reads only the total, one side's count, or the difference,
 * so each grid is folded onto those once and a leg costs a few dozen
 * additions instead of a grade per cell (a shots grid is 71×71). Each value
 * is still graded by gradeLeg, so a leg prices exactly as priceLeg prices it;
 * anything else falls through to priceLeg.
 */
export function statLegPricer(ctx: PricingContext): (market: string) => LegPrice | null {
  const folded = new Map<StatFamily, Marginals>();
  return (market) => {
    const family = statFamilyOf(market);
    const grid = family ? ctx.stats?.[family] : undefined;
    if (!family || !grid) return priceLeg(market, ctx);
    let m = folded.get(family);
    if (!m) folded.set(family, (m = marginalsOf(grid)));
    const [, a, b] = market.split(":");
    if (a === "over" || a === "under") return sumMarginal(m.total, (t) => gradeLeg(market, t, 0));
    if ((a === "home" || a === "away") && (b === "over" || b === "under")) {
      return a === "home" ? sumMarginal(m.home, (h) => gradeLeg(market, h, 0)) : sumMarginal(m.away, (x) => gradeLeg(market, 0, x));
    }
    if (a === "most" || a === "hcp") {
      const off = m.offset;
      return sumMarginal(m.diff, (k) => gradeLeg(market, Math.max(k - off, 0), Math.max(off - k, 0)));
    }
    return priceLeg(market, ctx);
  };
}
