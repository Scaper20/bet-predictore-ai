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

export type StatFamily = "corners" | "shots" | "sot" | "bookings";
const STAT_FAMILIES: readonly StatFamily[] = ["corners", "shots", "sot", "bookings"];

export interface PricingContext {
  /** P(home goals = i, away goals = j). */
  goals?: number[][];
  /** P(home count = i, away count = j), per count family. */
  stats?: Partial<Record<StatFamily, number[][]>>;
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

/**
 * The leg's chance of each settlement, or null when it is not a market we
 * price or the grid it needs is missing (a competition with no corners
 * history, a stat family inside a same-game combo).
 */
export function priceLeg(market: string, ctx: PricingContext): LegPrice | null {
  if (market.startsWith(COMBO)) {
    const parts = market.slice(COMBO.length).split("+");
    if (!ctx.goals || parts.some((p) => statFamilyOf(p))) return null;
    // Every part must survive for the combo to; it wins outright only when all win.
    return sumGrid(ctx.goals, (i, j) => {
      const gs = parts.map((p) => gradeLeg(p, i, j));
      if (gs.some((g) => g === null)) return null;
      if (gs.every((g) => g === "win")) return "win";
      if (gs.some((g) => g === "lose")) return "lose";
      if (gs.some((g) => g === "halfLose")) return "halfLose";
      return gs.some((g) => g === "push") ? "push" : "halfWin";
    });
  }
  const family = statFamilyOf(market);
  const grid = family ? ctx.stats?.[family] : ctx.goals;
  if (!grid) return null;
  return sumGrid(grid, (i, j) => gradeLeg(market, i, j));
}

/** The refund and half-settled share, for "74% · 9% refund" beside a chance. */
export function refundShare(price: LegPrice): number {
  return price.push + price.halfWin + price.halfLose;
}
