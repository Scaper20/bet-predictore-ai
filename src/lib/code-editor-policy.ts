import { fromRaw, rawMarket, type SportyBetSelection } from "@/lib/odds/markets";

/**
 * How the editor treats a pick it is asked to make safer, whatever the user
 * put on their code: keep it when it is solid, otherwise make the same bet
 * safer (a lower line, a wider range), otherwise swap it for a safer pick on
 * the same game, and only take it off when it is a long shot nothing can
 * rescue. Users play 2nd-half over 1.5, both halves under 1.5 and goal
 * bounds; the editor meets them there before it changes their bet.
 *
 * Pure. The bands are starting values, to be tuned from what users keep.
 */

export type Band = "solid" | "shaky" | "risky" | "outrageous";

/** Keep from 60%; try to make safer below; risky under 45%; a long shot under 35%. */
export const SOLID = 0.6;
export const SHAKY = 0.45;
export const RISKY = 0.35;
/** A long shot is rescued only by a pick that lands at least this often. */
export const RESCUE = 0.5;

export function bandOf(probability: number): Band {
  if (probability >= SOLID) return "solid";
  if (probability >= SHAKY) return "shaky";
  if (probability >= RISKY) return "risky";
  return "outrageous";
}

const LINE = /^\d+(?:\.\d+)?$/;
const step = (line: number, by: number) => Math.round((line + by) * 100) / 100;

/** Lines of an over/under, safest direction, nearest first: overs go down to 0.5, unders up `reach` goals. */
function lines(line: number, over: boolean, reach: number, floor = 0.5): number[] {
  const out: number[] = [];
  for (let k = 1; k <= reach; k++) {
    const l = step(line, over ? -k : k);
    if (l < floor) break;
    out.push(l);
  }
  return out;
}

/** A raw market's specifier with its total replaced ("total=1.5" -> "total=0.5"). */
const withTotal = (spec: string, line: number) => spec.replace(/total=\d+(?:\.\d+)?/, `total=${line}`);

const raw = (marketId: string, outcomeId: string, specifier?: string) => rawMarket({ marketId, outcomeId, ...(specifier ? { specifier } : {}) });

/** Goal bounds as "lo-hi" ids (10*lo + hi; hi at the market's maximum means "and more"). */
function widerBounds(sel: SportyBetSelection, max: number): string[] {
  const id = Number(sel.outcomeId);
  const [lo, hi] = [Math.floor(id / 10), id % 10];
  const out: { lo: number; hi: number; width: number }[] = [];
  for (let l = lo; l >= 0; l--) {
    for (let h = hi; h <= max; h++) {
      if (l === lo && h === hi) continue;
      out.push({ lo: l, hi: h, width: lo - l + (h - hi) });
    }
  }
  return out
    .filter((r) => r.width <= 3)
    .sort((a, b) => a.width - b.width || b.lo - a.lo)
    .map((r) => raw(sel.marketId, String(r.lo * 10 + r.hi)));
}

/** Multigoals (548) ranges by outcome id, and the ranges that contain each. */
const MULTI: Record<string, [number, number]> = {
  "1730": [1, 2], "1731": [1, 3], "1732": [1, 4], "1733": [1, 5], "1734": [1, 6], "1735": [2, 3], "1736": [2, 4],
  "1737": [2, 5], "1738": [2, 6], "1739": [3, 4], "1740": [3, 5], "1741": [3, 6], "1742": [4, 5], "1743": [4, 6], "1744": [5, 6],
};
function widerMulti(outcome: string): string[] {
  const r = MULTI[outcome];
  if (!r) return [];
  return Object.entries(MULTI)
    .filter(([id, [lo, hi]]) => id !== outcome && lo <= r[0] && hi >= r[1])
    .sort(([, a], [, b]) => a[1] - a[0] - (b[1] - b[0]))
    .map(([id]) => raw("548", id));
}

/** HT/FT outcome -> the full-time result it ends in. */
const HTFT_FT: Record<string, "home" | "draw" | "away"> = {
  "418": "home", "420": "draw", "422": "away", "424": "home", "426": "draw", "428": "away", "430": "home", "432": "draw", "434": "away",
};
const RESULT_DC: Record<string, string[]> = { home: ["1x2:home", "dc:home-draw"], away: ["1x2:away", "dc:draw-away"], draw: ["1x2:draw"] };

/** A raw market's safer versions, nearest first. */
function rawLadder(sel: SportyBetSelection): string[] {
  const { marketId: id, outcomeId: o, specifier: spec } = sel;
  const total = Number(spec?.match(/total=(\d+(?:\.\d+)?)/)?.[1]);
  // Half and team-in-half over/unders: 12 over, 13 under.
  if (["68", "69", "70", "90", "91", "92"].includes(id) && spec && Number.isFinite(total) && (o === "12" || o === "13")) {
    return lines(total, o === "12", 2).map((l) => raw(id, o, withTotal(spec, l)));
  }
  switch (id) {
    case "58": // Both halves over 1.5 -> both halves over 0.5 -> over 1.5.
      return o === "74" ? [raw("900984", "74"), "ou:over:2.5", "ou:over:1.5"] : [];
    case "59": // Both halves under 1.5 -> under 2.5 -> under 3.5.
      return o === "74" ? ["ou:under:2.5", "ou:under:3.5"] : [];
    case "900984":
      return o === "74" ? ["ou:over:1.5", "ou:over:0.5"] : [];
    case "450001":
      return widerBounds(sel, 5);
    case "450002":
    case "450003":
    case "810001":
      return widerBounds(sel, 3);
    case "548":
      return widerMulti(o);
    case "60100": // 2UP -> 1UP -> double chance 1UP.
      return o === "1" ? [raw("60200", "1"), raw("60110", "9")] : o === "3" ? [raw("60200", "3"), raw("60110", "11")] : [];
    case "60200":
      return o === "1" ? [raw("60110", "9"), "dc:home-draw"] : o === "3" ? [raw("60110", "11"), "dc:draw-away"] : [];
    case "60301": // Lead by 3 -> by 2 -> by 1, for either side or one.
    case "60302":
    case "60304":
    case "60305":
    case "60307":
    case "60308":
      return o === "74" ? [raw(String(Number(id) - 1), "74")] : [];
    case "47": {
      const ft = HTFT_FT[o];
      return ft ? RESULT_DC[ft] : [];
    }
    case "60": // Half-time result -> half-time double chance.
    case "83": {
      const dc = id === "60" ? "63" : "85";
      return o === "1" ? [raw(dc, "9")] : o === "3" ? [raw(dc, "11")] : o === "2" ? [raw(dc, "9"), raw(dc, "11")] : [];
    }
  }
  return [];
}

/**
 * Safer versions of the same bet, nearest first: what "lower the line" means
 * for each market. Empty for a market with no safer version of itself (a
 * double chance, both teams to score): the editor then swaps instead.
 */
export function saferLines(market: string): string[] {
  const sel = fromRaw(market);
  if (sel) return rawLadder(sel);
  const parts = market.split(":");
  const last = parts[parts.length - 1];
  const line = LINE.test(last) ? Number(last) : NaN;
  const swap = (l: number) => [...parts.slice(0, -1), String(l)].join(":");
  switch (parts[0]) {
    case "ou":
      return Number.isFinite(line) ? lines(line, parts[1] === "over", 2).map(swap) : [];
    case "tg":
      return Number.isFinite(line) ? lines(line, parts[2] === "over", 2).map(swap) : [];
    case "corners":
    case "shots":
    case "sot":
    case "bookings": {
      const side = parts.length === 4 ? parts[2] : parts[1];
      if (!Number.isFinite(line) || (side !== "over" && side !== "under")) return [];
      return lines(line, side === "over", 3).map(swap);
    }
    case "ah": {
      // More start for the side: +0.5 a step, three steps.
      const l = Number(parts[2]);
      if (!Number.isFinite(l)) return [];
      return [0.5, 1, 1.5].map((k) => `ah:${parts[1]}:${step(l, k) === 0 ? 0 : step(l, k)}`);
    }
    case "1x2":
      return parts[1] === "home" ? ["dc:home-draw"] : parts[1] === "away" ? ["dc:draw-away"] : [];
    case "dnb":
      return parts[1] === "home" ? ["dc:home-draw"] : parts[1] === "away" ? ["dc:draw-away"] : [];
  }
  return [];
}

export interface PolicyPick {
  market: string;
  probability: number;
  fairOdds: number;
}

export type Action = "kept" | "line" | "swap" | "removed";

export interface PolicyChoice<T extends PolicyPick> {
  action: Action;
  pick: T | null;
  /** Why, in a few words. */
  why: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * One game's decision: keep, a safer line of the same bet, a safer pick on
 * the game, or off. `ladder` holds the same bet's safer lines nearest first,
 * `others` every other pick on the game; both priced and already limited to
 * ones SportyBet lists and worth having.
 */
export function decide<T extends PolicyPick>(current: T | null, ladder: readonly T[], others: readonly T[], minGain: number): PolicyChoice<T> {
  const bestOf = (xs: readonly T[]) => xs.reduce<T | null>((b, x) => (!b || x.probability > b.probability ? x : b), null);
  if (!current) {
    const best = bestOf(others);
    return best ? { action: "swap", pick: best, why: "We couldn't read this pick: the safest one on the game instead." } : { action: "removed", pick: null, why: "We couldn't read this pick or offer another." };
  }
  const band = bandOf(current.probability);
  if (band === "solid") return { action: "kept", pick: current, why: `Solid at ${pct(current.probability)}.` };

  const better = (x: T) => x.probability >= current.probability + minGain;
  // The nearest safer line that is solid, else the safest of them.
  const lineUp = ladder.filter(better);
  const line = lineUp.find((x) => x.probability >= SOLID) ?? bestOf(lineUp);
  const swap = bestOf(others.filter(better));

  let choice: { action: Action; pick: T } | null = null;
  if (line && line.probability >= SOLID) choice = { action: "line", pick: line };
  else if (swap && swap.probability >= SOLID) choice = { action: "swap", pick: swap };
  else {
    const best = [line, swap].filter((x): x is T => x !== null).sort((a, b) => b.probability - a.probability)[0];
    if (best) choice = { action: best === line ? "line" : "swap", pick: best };
  }

  const floor = band === "outrageous" ? RESCUE : band === "risky" ? SHAKY : 0;
  if (!choice || choice.pick.probability < floor) {
    if (band === "shaky") return { action: "kept", pick: current, why: `Nothing safer on this game: kept at ${pct(current.probability)}.` };
    return { action: "removed", pick: null, why: `${pct(current.probability)} is too long a shot, and nothing on this game makes it safe.` };
  }
  const how = choice.action === "line" ? "Same bet, safer line" : "Safer pick on the same game";
  return { ...choice, why: `${how}: ${pct(current.probability)} to ${pct(choice.pick.probability)}.` };
}
