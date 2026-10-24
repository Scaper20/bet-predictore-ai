import { gradeHandicap, type PickResult } from "@/lib/settlement";
import type { SportyBetSelection } from "./markets";

/**
 * How SportyBet settles the markets we keep as SportyBet addresses them
 * (markets.ts rawMarket), so the model can price them off its own grids
 * (leg-pricing.ts priceLeg) and settlement can grade them.
 *
 * Each grader states the score it needs: the final score ("ft"), both
 * halves' scores ("halves": half-time/full-time, both halves over 1.5,
 * second-half lines...), or the corner count ("corners"). A market or
 * outcome not listed here returns null and is read from SportyBet's own
 * chance instead (market-read.ts), never guessed: the outcome ids are
 * Betradar's, and only ones seen on SportyBet's own event pages (24 Oct
 * 2026, docs in the tests) are mapped.
 */

export type RawGrader =
  | { scope: "ft"; grade: (home: number, away: number) => PickResult }
  | { scope: "halves"; grade: (h1: number, a1: number, h2: number, a2: number) => PickResult }
  | { scope: "corners"; grade: (home: number, away: number) => PickResult };

type Two = (x: number, y: number) => PickResult;

const of = (b: boolean): PickResult => (b ? "win" : "lose");
const sign = (x: number) => (x > 0 ? "1" : x === 0 ? "2" : "3");
const isWhole = (line: number) => Number.isInteger(line);
const isQuarter = (line: number) => Math.abs((line * 4) % 2) === 1;

/** "total=2.5" -> 2.5; null without a usable line. */
function totalOf(spec: string | undefined): number | null {
  const m = spec?.match(/(?:^|\|)total=(\d+(?:\.\d+)?)(?:$|\|)/);
  return m ? Number(m[1]) : null;
}

/** Yes/No markets: 74/76 on most, 39/40 on SportyBet's own (9000xx) ones. */
function yesNo(outcome: string, holds: boolean): PickResult | null {
  if (outcome === "74" || outcome === "39") return of(holds);
  if (outcome === "76" || outcome === "40") return of(!holds);
  return null;
}

/* ---------- one score (a whole match, a half, a corner count) ---------- */

function result(outcome: string): Two | null {
  return ["1", "2", "3"].includes(outcome) ? (x, y) => of(sign(x - y) === outcome) : null;
}

const DC: Record<string, string> = { "9": "3", "10": "2", "11": "1" }; // the result each one excludes
function doubleChance(outcome: string): Two | null {
  const not = DC[outcome];
  return not ? (x, y) => of(sign(x - y) !== not) : null;
}

function drawNoBet(outcome: string): Two | null {
  if (outcome !== "4" && outcome !== "5") return null;
  return (x, y) => (x === y ? "push" : of((x > y) === (outcome === "4")));
}

/** Three-way handicap "hcp=0:1": the start each side is given, then a plain result. */
function handicap3(outcome: string, spec: string | undefined): Two | null {
  const m = spec?.match(/^hcp=(\d+):(\d+)$/);
  const want = { "1711": "1", "1712": "2", "1713": "3" }[outcome];
  if (!m || !want) return null;
  const [hs, as] = [Number(m[1]), Number(m[2])];
  return (x, y) => of(sign(x + hs - (y + as)) === want);
}

/** Asian handicap "hcp=-1.5" on the home side; 1714 home, 1715 away. Quarter lines are left to SportyBet's read. */
function asian(outcome: string, spec: string | undefined): Two | null {
  const m = spec?.match(/^hcp=(-?\d+(?:\.\d+)?)$/);
  if (!m || (outcome !== "1714" && outcome !== "1715")) return null;
  const line = Number(m[1]);
  if (isQuarter(line)) return null;
  return outcome === "1714" ? (x, y) => gradeHandicap("home", line, x, y) : (x, y) => gradeHandicap("away", -line, x, y);
}

/** Over/under on a count: 12/30 over, 13/31 under; a whole line pushes. */
function overUnder(outcome: string, line: number | null, count: (x: number, y: number) => number): Two | null {
  const over = outcome === "12" || outcome === "30";
  const under = outcome === "13" || outcome === "31";
  if (line === null || (!over && !under) || isQuarter(line)) return null;
  return (x, y) => {
    const n = count(x, y);
    if (isWhole(line) && n === line) return "push";
    return of(over ? n > line : n < line);
  };
}

function oddEven(outcome: string, count: (x: number, y: number) => number): Two | null {
  if (outcome === "70" || outcome === "33") return (x, y) => of(count(x, y) % 2 === 1);
  if (outcome === "72" || outcome === "32") return (x, y) => of(count(x, y) % 2 === 0);
  return null;
}

/** Betradar's exact-goals outcome ids per variant, in goal order; the last is "N+". */
const EXACT: Record<string, number[]> = {
  "2+": [85, 86, 87],
  "3+": [88, 89, 90, 91],
  "6+": [68, 69, 70, 71, 72, 73, 74],
};
function exactGoals(outcome: string, spec: string | undefined, count: (x: number, y: number) => number): Two | null {
  const variant = spec?.match(/^variant=sr:exact_goals:(\d\+)$/)?.[1];
  const ids = variant ? EXACT[variant] : undefined;
  const id = Number(outcome.split(":").pop());
  const k = ids?.indexOf(id) ?? -1;
  if (!ids || k < 0 || !outcome.startsWith(`sr:exact_goals:${variant}:`)) return null;
  const last = k === ids.length - 1;
  return (x, y) => of(last ? count(x, y) >= k : count(x, y) === k);
}

/** A range of a count, inclusive; hi Infinity for "N+". */
const inRange = (lo: number, hi: number, count: (x: number, y: number) => number): Two => (x, y) => {
  const n = count(x, y);
  return of(n >= lo && n <= hi);
};

/** Goal bounds: id 10*lo + hi, where hi at the market's maximum means "and more". */
function goalBounds(outcome: string, max: number, count: (x: number, y: number) => number): Two | null {
  if (!/^\d+$/.test(outcome)) return null;
  const id = Number(outcome);
  const lo = Math.floor(id / 10);
  const hi = id % 10;
  if (lo > hi || hi > max) return null;
  return inRange(lo, hi === max ? Infinity : hi, count);
}

/** Excluded number of goals: wins unless the count is exactly k ("k+" at the market's maximum). */
function excluded(outcome: string, max: number, count: (x: number, y: number) => number): Two | null {
  if (!/^\d+$/.test(outcome)) return null;
  const k = Number(outcome);
  if (k > max) return null;
  return (x, y) => of(k === max ? count(x, y) < k : count(x, y) !== k);
}

/** Multigoals over a whole match (548). */
const MULTI_FULL: Record<string, [number, number]> = {
  "1730": [1, 2], "1731": [1, 3], "1732": [1, 4], "1733": [1, 5], "1734": [1, 6], "1735": [2, 3], "1736": [2, 4],
  "1737": [2, 5], "1738": [2, 6], "1739": [3, 4], "1740": [3, 5], "1741": [3, 6], "1742": [4, 5], "1743": [4, 6],
  "1744": [5, 6], "1745": [7, Infinity], "1804": [0, 0],
};
/** Multigoals for a team or a half (549, 550, 552, 553). */
const MULTI_SHORT: Record<string, [number, number]> = {
  "1746": [1, 2], "1747": [1, 3], "1748": [2, 3], "1749": [4, Infinity], "1805": [0, 0],
};
function multi(table: Record<string, [number, number]>, outcome: string, count: (x: number, y: number) => number): Two | null {
  const r = table[outcome];
  return r ? inRange(r[0], r[1], count) : null;
}

/** Correct-score outcome ids: full match (45), first half (81), second half (98). */
function scoreTable(first: number, scores: string[], other: number): Record<string, [number, number] | "other"> {
  const out: Record<string, [number, number] | "other"> = { [String(other)]: "other" };
  scores.forEach((s, i) => {
    const [h, a] = s.split(":").map(Number);
    out[String(first + 2 * i)] = [h, a];
  });
  return out;
}
const CS_FULL = scoreTable(
  274,
  ["0:0", "1:0", "2:0", "3:0", "4:0", "0:1", "1:1", "2:1", "3:1", "4:1", "0:2", "1:2", "2:2", "3:2", "4:2", "0:3", "1:3", "2:3", "3:3", "4:3", "0:4", "1:4", "2:4", "3:4", "4:4"],
  324,
);
const CS_FIRST = scoreTable(462, ["0:0", "1:1", "2:2", "1:0", "2:0", "2:1", "0:1", "0:2", "1:2"], 480);
const CS_SECOND = scoreTable(546, ["0:0", "0:1", "0:2", "1:0", "1:1", "1:2", "2:0", "2:1", "2:2"], 564);
function correctScore(table: Record<string, [number, number] | "other">, outcome: string): Two | null {
  const want = table[outcome];
  if (!want) return null;
  const listed = Object.values(table).filter((v): v is [number, number] => v !== "other");
  if (want === "other") return (x, y) => of(!listed.some(([h, a]) => h === x && a === y));
  return (x, y) => of(x === want[0] && y === want[1]);
}

/** Result & both teams to score: 78 home & yes ... 88 away & no. */
const RESULT_BTTS: Record<string, [string, boolean]> = {
  "78": ["1", true], "80": ["1", false], "82": ["2", true], "84": ["2", false], "86": ["3", true], "88": ["3", false],
};
/** Result & over/under: 794 home & under ... 804 away & over. */
const RESULT_OU: Record<string, [string, boolean]> = {
  "794": ["1", false], "796": ["1", true], "798": ["2", false], "800": ["2", true], "802": ["3", false], "804": ["3", true],
};
/** Double chance & both teams to score: the result each excludes, and yes/no. */
const DC_BTTS: Record<string, [string, boolean]> = {
  "1718": ["3", true], "1719": ["3", false], "1720": ["2", true], "1721": ["2", false], "1722": ["1", true], "1723": ["1", false],
};
/** Second-half double chance & total (900043). */
const DC_TOTAL: Record<string, [string, boolean]> = {
  "145": ["3", true], "146": ["2", true], "147": ["1", true], "148": ["3", false], "149": ["2", false], "150": ["1", false],
};

const total = (x: number, y: number) => x + y;
const homeCount = (x: number) => x;
const awayCount = (_: number, y: number) => y;

/** Markets on one score, the same whether it is the whole match, a half, or the corners. */
function oneScore(id: string, outcome: string, spec: string | undefined): Two | null {
  switch (id) {
    case "1x2": return result(outcome);
    case "dc": return doubleChance(outcome);
    case "dnb": return drawNoBet(outcome);
    case "hcp3": return handicap3(outcome, spec);
    case "ah": return asian(outcome, spec);
    case "ou": return overUnder(outcome, totalOf(spec), total);
    case "home-ou": return overUnder(outcome, totalOf(spec), homeCount);
    case "away-ou": return overUnder(outcome, totalOf(spec), awayCount);
    case "exact": return exactGoals(outcome, spec, total);
    case "home-exact": return exactGoals(outcome, spec, homeCount);
    case "away-exact": return exactGoals(outcome, spec, awayCount);
    case "odd-even": return oddEven(outcome, total);
    case "home-odd-even": return oddEven(outcome, homeCount);
    case "away-odd-even": return oddEven(outcome, awayCount);
    case "gg": return yesNo(outcome, true) ? (x, y) => yesNo(outcome, x > 0 && y > 0)! : null;
    case "home-cs": return yesNo(outcome, true) ? (x, y) => yesNo(outcome, y === 0)! : null;
    case "away-cs": return yesNo(outcome, true) ? (x) => yesNo(outcome, x === 0)! : null;
    case "home-nil": return yesNo(outcome, true) ? (x, y) => yesNo(outcome, x > y && y === 0)! : null;
    case "away-nil": return yesNo(outcome, true) ? (x, y) => yesNo(outcome, y > x && x === 0)! : null;
    case "result-gg": {
      const r = RESULT_BTTS[outcome];
      return r ? (x, y) => of(sign(x - y) === r[0] && (x > 0 && y > 0) === r[1]) : null;
    }
    case "result-ou": {
      const r = RESULT_OU[outcome];
      const line = totalOf(spec);
      return r && line !== null && !isWhole(line) ? (x, y) => of(sign(x - y) === r[0] && x + y > line === r[1]) : null;
    }
    case "dc-gg": {
      const r = DC_BTTS[outcome];
      return r ? (x, y) => of(sign(x - y) !== r[0] && (x > 0 && y > 0) === r[1]) : null;
    }
    case "dc-total": {
      const r = DC_TOTAL[outcome];
      const line = totalOf(spec);
      return r && line !== null && !isWhole(line) ? (x, y) => of(sign(x - y) !== r[0] && x + y > line === r[1]) : null;
    }
    case "multi": return multi(MULTI_SHORT, outcome, total);
    case "home-multi": return multi(MULTI_SHORT, outcome, homeCount);
    case "away-multi": return multi(MULTI_SHORT, outcome, awayCount);
    case "bounds": return goalBounds(outcome, 3, total);
    case "cs-first": return correctScore(CS_FIRST, outcome);
    case "cs-second": return correctScore(CS_SECOND, outcome);
    case "excluded": return excluded(outcome, 3, total);
  }
  return null;
}

/** First-half (60s-80s, 552, 810001...) and second-half (83-98, 553, 9000xx...) markets: one score each. */
const FIRST_HALF: Record<string, string> = {
  "60": "1x2", "63": "dc", "64": "dnb", "65": "hcp3", "66": "ah", "68": "ou", "69": "home-ou", "70": "away-ou",
  "71": "exact", "74": "odd-even", "75": "gg", "76": "home-cs", "77": "away-cs", "78": "result-gg", "79": "result-ou",
  "81": "cs-first", "542": "dc-gg", "552": "multi", "810001": "bounds", "810002": "excluded", "900036": "home-nil",
};
const SECOND_HALF: Record<string, string> = {
  "83": "1x2", "85": "dc", "86": "dnb", "87": "hcp3", "88": "ah", "90": "ou", "91": "home-ou", "92": "away-ou",
  "93": "exact", "94": "odd-even", "95": "gg", "96": "home-cs", "97": "away-cs", "98": "cs-second", "543": "result-gg", "544": "result-ou",
  "545": "dc-gg", "553": "multi", "900038": "home-nil", "900052": "away-nil", "900029": "home-odd-even",
  "900030": "away-odd-even", "900043": "dc-total",
};

/** Whole-match markets on the final score alone. */
function fullTime(id: string, outcome: string, spec: string | undefined): Two | null {
  switch (id) {
    case "12": // Home no bet: a home win refunds.
      return outcome === "776" || outcome === "778" ? (x, y) => (x > y ? "push" : of(sign(x - y) === (outcome === "776" ? "2" : "3"))) : null;
    case "13": // Away no bet.
      return outcome === "780" || outcome === "782" ? (x, y) => (y > x ? "push" : of(sign(x - y) === (outcome === "780" ? "1" : "2"))) : null;
    case "15": {
      const k = Number(outcome.match(/^sr:winning_margin:3\+:(\d+)$/)?.[1]) - 113;
      if (spec !== "variant=sr:winning_margin:3+" || !(k >= 0 && k <= 6)) return null;
      if (k === 6) return (x, y) => of(x === y);
      const margin = (k % 3) + 1;
      const home = k < 3;
      return (x, y) => {
        const d = home ? x - y : y - x;
        return of(margin === 3 ? d >= 3 : d === margin);
      };
    }
    case "21": return exactGoals(outcome, spec, total);
    case "23": return exactGoals(outcome, spec, homeCount);
    case "24": return exactGoals(outcome, spec, awayCount);
    case "25": {
      const r = { "1342": [0, 1], "1343": [2, 3], "1344": [4, 6], "1345": [7, Infinity] }[outcome.split(":").pop()!];
      return spec === "variant=sr:goal_range:7+" && r ? inRange(r[0], r[1], total) : null;
    }
    case "26": return oddEven(outcome, total);
    case "27": return oddEven(outcome, homeCount);
    case "28": return oddEven(outcome, awayCount);
    case "30": {
      const want = { "784": [false, false], "788": [true, false], "790": [false, true], "792": [true, true] }[outcome];
      return want ? (x, y) => of(x > 0 === want[0] && y > 0 === want[1]) : null;
    }
    case "31": return oneScore("home-cs", outcome, spec);
    case "32": return oneScore("away-cs", outcome, spec);
    case "33": return oneScore("home-nil", outcome, spec);
    case "34": return oneScore("away-nil", outcome, spec);
    case "45": return correctScore(CS_FULL, outcome);
    case "548": return multi(MULTI_FULL, outcome, total);
    case "549": return multi(MULTI_SHORT, outcome, homeCount);
    case "550": return multi(MULTI_SHORT, outcome, awayCount);
    case "450001": return goalBounds(outcome, 5, total);
    case "450002": return goalBounds(outcome, 3, homeCount);
    case "450003": return goalBounds(outcome, 3, awayCount);
    case "450004": return excluded(outcome, 5, total);
    case "450005": return excluded(outcome, 3, homeCount);
    case "450006": return excluded(outcome, 3, awayCount);
    case "900041": return yesNo(outcome, true) ? (x, y) => yesNo(outcome, x !== y && x > 0 && y > 0)! : null;
  }
  // "X or Y" (854-865): either side of the "or" landing wins.
  const either = EITHER[id];
  if (either) {
    const line = totalOf(spec);
    if (either[1] !== "gg" && either[1] !== "cs" && (line === null || isWhole(line))) return null;
    if (!yesNo(outcome, true)) return null;
    return (x, y) => {
      const second = either[1] === "over" ? x + y > line! : either[1] === "under" ? x + y < line! : either[1] === "gg" ? x > 0 && y > 0 : x === 0 || y === 0;
      return yesNo(outcome, sign(x - y) === either[0] || second)!;
    };
  }
  return null;
}
const EITHER: Record<string, [string, "over" | "under" | "gg" | "cs"]> = {
  "854": ["1", "over"], "855": ["1", "under"], "856": ["2", "over"], "857": ["2", "under"], "858": ["3", "over"], "859": ["3", "under"],
  "860": ["1", "gg"], "861": ["2", "gg"], "862": ["3", "gg"], "863": ["1", "cs"], "864": ["2", "cs"], "865": ["3", "cs"],
};

type Four = (h1: number, a1: number, h2: number, a2: number) => PickResult;

const HTFT_ORDER = ["11", "12", "13", "21", "22", "23", "31", "32", "33"]; // half-time result, then full-time
/** Highest scoring half, as the sign of first minus second: 436 first, 438 second, 440 equal. */
const HALF: Record<string, "1" | "2" | "3"> = { "436": "1", "438": "3", "440": "2" };

/** Markets that need both halves' scores. */
function bothHalves(id: string, outcome: string, spec: string | undefined): Four | null {
  const yn = (holds: (h1: number, a1: number, h2: number, a2: number) => boolean): Four | null =>
    yesNo(outcome, true) ? (h1, a1, h2, a2) => yesNo(outcome, holds(h1, a1, h2, a2))! : null;
  switch (id) {
    case "47": {
      const k = Number(outcome) - 418;
      if (!(k >= 0 && k <= 16 && k % 2 === 0)) return null;
      const want = HTFT_ORDER[k / 2];
      return (h1, a1, h2, a2) => of(sign(h1 - a1) + sign(h1 + h2 - a1 - a2) === want);
    }
    case "818":
    case "819": {
      const k = Number(outcome) - 1836;
      const line = totalOf(spec);
      if (!(k >= 0 && k < 18) || line === null || isWhole(line)) return null;
      const want = HTFT_ORDER[k % 9];
      const over = k >= 9;
      return (h1, a1, h2, a2) => {
        const goals = id === "818" ? h1 + h2 + a1 + a2 : h1 + a1;
        return of(sign(h1 - a1) + sign(h1 + h2 - a1 - a2) === want && goals > line === over);
      };
    }
    case "48": return yn((h1, a1, h2, a2) => h1 > a1 && h2 > a2);
    case "49": return yn((h1, a1, h2, a2) => a1 > h1 && a2 > h2);
    case "50": return yn((h1, a1, h2, a2) => h1 > a1 || h2 > a2);
    case "51": return yn((h1, a1, h2, a2) => a1 > h1 || a2 > h2);
    case "56": return yn((h1, _a1, h2) => h1 > 0 && h2 > 0);
    case "57": return yn((_h1, a1, _h2, a2) => a1 > 0 && a2 > 0);
    case "58": {
      const line = totalOf(spec);
      return line === 1.5 ? yn((h1, a1, h2, a2) => h1 + a1 > 1.5 && h2 + a2 > 1.5) : null;
    }
    case "59": {
      const line = totalOf(spec);
      return line === 1.5 ? yn((h1, a1, h2, a2) => h1 + a1 < 1.5 && h2 + a2 < 1.5) : null;
    }
    case "900984": return yn((h1, a1, h2, a2) => h1 + a1 > 0 && h2 + a2 > 0);
    case "52":
    case "53":
    case "54": {
      const want = HALF[outcome];
      if (!want) return null;
      const count = id === "52" ? (h: number, a: number) => h + a : id === "53" ? (h: number) => h : (_: number, a: number) => a;
      return (h1, a1, h2, a2) => of(sign(count(h1, a1) - count(h2, a2)) === want);
    }
    case "55": {
      const want = { "806": [false, false], "808": [true, false], "810": [true, true], "812": [false, true] }[outcome];
      return want ? (h1, a1, h2, a2) => of((h1 > 0 && a1 > 0) === want[0] && (h2 > 0 && a2 > 0) === want[1]) : null;
    }
    case "540":
    case "541": {
      const r = DC_BTTS[outcome];
      if (!r) return null;
      return (h1, a1, h2, a2) => {
        const half = id === "540" ? h1 > 0 && a1 > 0 : h2 > 0 && a2 > 0;
        return of(sign(h1 + h2 - a1 - a2) !== r[0] && half === r[1]);
      };
    }
    case "1179": // Either the half-time or the full-time result.
      return ["1", "2", "3"].includes(outcome) ? (h1, a1, h2, a2) => of(sign(h1 - a1) === outcome || sign(h1 + h2 - a1 - a2) === outcome) : null;
  }
  return null;
}

/** Corner markets beyond the catalogue's lines: ranges and odd/even. */
function corners(id: string, outcome: string, spec: string | undefined): Two | null {
  const n = Number(outcome.split(":").pop());
  if (id === "169" && spec === "variant=sr:point_range:12+") {
    const r = { 1141: [0, 8], 1142: [9, 11], 1143: [12, Infinity] }[n];
    return r ? inRange(r[0], r[1], total) : null;
  }
  if ((id === "170" || id === "171") && spec === "variant=sr:point_range:7+") {
    const r = { 1144: [0, 2], 1145: [3, 4], 1146: [5, 6], 1147: [7, Infinity] }[n];
    return r ? inRange(r[0], r[1], id === "170" ? homeCount : awayCount) : null;
  }
  if (id === "172") return oddEven(outcome, total);
  return null;
}

/** How SportyBet settles one selection, and the score it needs; null for one we leave to SportyBet's read. */
export function rawGrader(sel: SportyBetSelection): RawGrader | null {
  const { marketId: id, outcomeId: outcome, specifier: spec } = sel;
  const ft = fullTime(id, outcome, spec);
  if (ft) return { scope: "ft", grade: ft };
  if (FIRST_HALF[id]) {
    const g = oneScore(FIRST_HALF[id], outcome, spec);
    return g ? { scope: "halves", grade: (h1, a1) => g(h1, a1) } : null;
  }
  if (SECOND_HALF[id]) {
    const g = oneScore(SECOND_HALF[id], outcome, spec);
    return g ? { scope: "halves", grade: (_h1, _a1, h2, a2) => g(h2, a2) } : null;
  }
  const halves = bothHalves(id, outcome, spec);
  if (halves) return { scope: "halves", grade: halves };
  const c = corners(id, outcome, spec);
  return c ? { scope: "corners", grade: c } : null;
}
