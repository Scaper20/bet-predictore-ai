import type { SportyBetSelection } from "@/lib/odds/markets";

/**
 * Markets settled on the order and timing of goals, not the final score:
 * 1UP / 2UP, lead by N at any time, double chance 1UP, win from behind,
 * goals in a row, first and last goal, the first goal's minute, and the
 * score after N minutes.
 *
 * The match is played minute by minute (in half-minute steps) as two
 * Poisson goal processes at the model's own expected goals, split between
 * the halves the way halves.ts splits them and even within each half. A
 * dynamic program follows the score plus whatever the market needs to
 * remember (has the home side ever led by two? who scored last?), so every
 * chance is exact for that process.
 *
 * Backtested on 13,225 league games from July 2024 (scripts/lead-lab.ts:
 * closing prices for each side's expected goals, ESPN's goal times for the
 * result), so the test is of the timing alone:
 *
 *   market              said    landed      market              said    landed
 *   1UP home            58.8%   59.9%       any lead by 2       49.7%   45.8%
 *   1UP away            47.8%   48.5%       any 2 in a row      57.8%   56.0%
 *   2UP home            46.1%   45.3%       first goal home     51.6%   51.6%
 *   2UP away            33.7%   32.5%       first goal 1-15'    33.7%   30.9%
 *   DC 1UP home/draw    72.7%   75.1%       over 0.5 by 25'     49.5%   46.9%
 *
 * The 1UP family is within about two points. Early-goal markets run about
 * three high (goals are spread evenly within a half here; real games start
 * slower) and "lead by 2" four high (a side two up eases off). Still labelled
 * an estimate and never called strong until it has a live record.
 */

export interface HalfRates {
  first: { home: number; away: number };
  second: { home: number; away: number };
}

/** Half-minute steps: a 1-in-60 chance of a goal per step at most, so two in one step can be ignored. */
const STEPS_PER_MINUTE = 2;
const MAX_GOALS = 10;

interface State {
  h: number;
  a: number;
  /** What the market remembers beyond the score; 0 at kick-off. */
  x: number;
}

/**
 * The chance a market lands, given how its memory moves on each goal and
 * whether it lands from the final state. Played to `minutes` (90 by
 * default; a market on the first N minutes stops there).
 */
function play(
  rates: HalfRates,
  memory: (s: State, scorer: "h" | "a", minute: number) => number,
  lands: (s: State) => boolean,
  minutes = 90,
): number {
  let states = new Map<number, State & { p: number }>([[0, { h: 0, a: 0, x: 0, p: 1 }]]);
  for (let step = 0; step < minutes * STEPS_PER_MINUTE; step++) {
    const minute = Math.floor(step / STEPS_PER_MINUTE) + 1;
    const half = minute <= 45 ? rates.first : rates.second;
    const ph = half.home / (45 * STEPS_PER_MINUTE);
    const pa = half.away / (45 * STEPS_PER_MINUTE);
    const next = new Map<number, State & { p: number }>();
    const add = (s: State, p: number) => {
      const k = (s.h * (MAX_GOALS + 1) + s.a) * 4096 + s.x;
      const e = next.get(k);
      if (e) e.p += p;
      else next.set(k, { ...s, p });
    };
    for (const s of states.values()) {
      if (s.p < 1e-12) continue;
      add(s, s.p * (1 - ph - pa));
      if (s.h < MAX_GOALS) {
        const t = { h: s.h + 1, a: s.a, x: 0 };
        add({ ...t, x: memory({ ...t, x: s.x }, "h", minute) }, s.p * ph);
      }
      if (s.a < MAX_GOALS) {
        const t = { h: s.h, a: s.a + 1, x: 0 };
        add({ ...t, x: memory({ ...t, x: s.x }, "a", minute) }, s.p * pa);
      }
    }
    states = next;
  }
  let p = 0;
  for (const s of states.values()) if (lands(s)) p += s.p;
  return p;
}

const keep = (s: State) => s.x;

/** Ever led by `k`: bit 1 home, bit 2 away. */
const ledBy = (k: number) => (s: State) => s.x | (s.h - s.a >= k ? 1 : 0) | (s.a - s.h >= k ? 2 : 0);

/** Ever behind: bit 1 home trailed, bit 2 away trailed. */
const trailed = (s: State) => s.x | (s.h < s.a ? 1 : 0) | (s.a < s.h ? 2 : 0);

/** The run of goals by one side: +n home's n in a row, -n away's; bits above 8 mark a run of 2 or 3 reached. */
function runOf(s: State, scorer: "h" | "a"): number {
  const flags = s.x & ~0xff;
  const run = (s.x & 0xff) - 4; // stored offset by 4
  const now = scorer === "h" ? (run > 0 ? Math.min(run + 1, 3) : 1) : run < 0 ? Math.max(run - 1, -3) : -1;
  let f = flags;
  if (now >= 2) f |= 0x100;
  if (now >= 3) f |= 0x200;
  if (now <= -2) f |= 0x400;
  if (now <= -3) f |= 0x800;
  return f | (now + 4);
}

/** The minute bounds of SportyBet's first-goal intervals (100: 15 min, 101: 10 min). */
const INTERVALS: Record<string, Record<string, [number, number]>> = {
  "100": { "584": [1, 15], "586": [16, 30], "588": [31, 45], "590": [46, 60], "592": [61, 75], "594": [76, 90] },
  "101": {
    "598": [1, 10], "600": [11, 20], "602": [21, 30], "604": [31, 40], "606": [41, 50],
    "608": [51, 60], "610": [61, 70], "612": [71, 80], "614": [81, 90],
  },
};

type Memory = (s: State, scorer: "h" | "a", minute: number) => number;

/** A market as the process reads it: what it remembers, when it lands, and over how many minutes. */
interface Spec {
  memory: Memory;
  lands: (s: State) => boolean;
  minutes?: number;
}

/** "No" lands exactly when "yes" doesn't. */
const yesNo = (outcome: string, spec: Spec): Spec | null =>
  outcome === "74" || outcome === "39" ? spec : outcome === "76" || outcome === "40" ? { ...spec, lands: (s) => !spec.lands(s) } : null;

/**
 * How the process reads one SportyBet selection, or null for one it doesn't
 * price. Never Down and early goals are left to SportyBet's own read: their
 * rules don't match any reading we could confirm against its prices.
 */
function specFor(sel: SportyBetSelection): Spec | null {
  const { marketId: id, outcomeId: o, specifier: spec } = sel;
  const side = (k: string) => (k === "1" ? 1 : k === "3" ? 2 : 0);
  switch (id) {
    case "60200": // 1UP: a win the moment the side goes a goal up; otherwise the full-time result.
    case "60100": { // 2UP: the same at two goals up.
      const k = id === "60200" ? 1 : 2;
      if (o === "2") return { memory: keep, lands: (s) => s.h === s.a };
      const bit = side(o);
      if (!bit) return null;
      return { memory: ledBy(k), lands: (s) => (s.x & bit) !== 0 || (bit === 1 ? s.h > s.a : s.a > s.h) };
    }
    case "60110": { // Double chance 1UP: the side's half of the pair wins once it goes a goal up.
      if (o === "10") return { memory: keep, lands: (s) => s.h !== s.a };
      if (o === "9") return { memory: ledBy(1), lands: (s) => (s.x & 1) !== 0 || s.h >= s.a };
      if (o === "11") return { memory: ledBy(1), lands: (s) => (s.x & 2) !== 0 || s.a >= s.h };
      return null;
    }
    case "60300": case "60301": case "60302": case "60303": case "60304": case "60305": case "60306": case "60307": case "60308": {
      const n = Number(id) - 60300;
      const bits = n < 3 ? 3 : n < 6 ? 1 : 2;
      return yesNo(o, { memory: ledBy((n % 3) + 1), lands: (s) => (s.x & bits) !== 0 });
    }
    case "900383": case "900384": { // Win from behind: behind at some point, winner at the end.
      const home = id === "900383";
      return yesNo(o, { memory: trailed, lands: (s) => (home ? (s.x & 1) !== 0 && s.h > s.a : (s.x & 2) !== 0 && s.a > s.h) });
    }
    case "60010": case "60011": case "60012": case "60020": case "60021": case "60022": {
      const three = id.startsWith("6002");
      const who = id.endsWith("0") ? "any" : id.endsWith("1") ? "home" : "away";
      const homeBit = three ? 0x200 : 0x100;
      const awayBit = three ? 0x800 : 0x400;
      const want = who === "any" ? homeBit | awayBit : who === "home" ? homeBit : awayBit;
      return yesNo(o, { memory: (s, scorer) => runOf({ ...s, x: s.x || 4 }, scorer), lands: (s) => (s.x & want) !== 0 });
    }
    case "8": case "9": case "62": case "84": { // First goal, last goal, and each half's first goal: 6 home, 7 none, 8 away.
      const code = { "6": 1, "7": 0, "8": 2 }[o];
      // "goalnr=2" would be the second goal: only the first is priced.
      if (code === undefined || (id !== "9" && spec !== "goalnr=1")) return null;
      const [from, to] = id === "62" ? [1, 45] : id === "84" ? [46, 90] : [1, 90];
      const first = id !== "9";
      return {
        memory: (s, scorer, minute) => (minute < from || minute > to || (first && s.x) ? s.x : scorer === "h" ? 1 : 2),
        lands: (s) => s.x === code,
      };
    }
    case "184": { // First goal & result: 814-818 home scored first and home/draw/away won, 820-824 away first, 826 no goal.
      if (spec !== "goalnr=1") return null;
      if (o === "826") return { memory: keep, lands: (s) => s.h + s.a === 0 };
      const k = (Number(o) - 814) / 2;
      if (!(k >= 0 && k <= 5 && Number.isInteger(k))) return null;
      const first = k < 3 ? 1 : 2;
      const result = ["1", "2", "3"][k % 3];
      return {
        memory: (s, scorer) => s.x || (scorer === "h" ? 1 : 2),
        lands: (s) => s.x === first && (s.h > s.a ? "1" : s.h === s.a ? "2" : "3") === result,
      };
    }
    case "100": case "101": { // The minute of the first goal; "None" for a goalless game.
      if (spec !== "goalnr=1") return null;
      if (o === "596" || o === "616") return { memory: keep, lands: (s) => s.h + s.a === 0 };
      const range = INTERVALS[id][o];
      if (!range) return null;
      return { memory: (s, _scorer, minute) => s.x || minute, lands: (s) => s.x >= range[0] && s.x <= range[1] };
    }
    case "900069": case "105": { // Result at minute N (900069 "minute=N", 105 "from=1|to=N").
      const n = Number(spec?.match(/(?:minute|to)=(\d+)$/)?.[1]);
      if (id === "105" && !spec?.startsWith("from=1|")) return null;
      if (!(n > 0 && n < 90) || !["1", "2", "3"].includes(o)) return null;
      return { memory: keep, lands: (s) => (s.h > s.a ? "1" : s.h === s.a ? "2" : "3") === o, minutes: n };
    }
    case "900313": { // Total goals in the first N minutes.
      const m = spec?.match(/^minute=(\d+)\|total=(\d+\.5)$/);
      if (!m || (o !== "30" && o !== "31")) return null;
      const line = Number(m[2]);
      return { memory: keep, lands: (s) => s.h + s.a > line === (o === "30"), minutes: Number(m[1]) };
    }
  }
  return null;
}

/** The process's chance for one SportyBet selection, or null for one it doesn't price. */
export function leadChance(sel: SportyBetSelection, rates: HalfRates): number | null {
  const spec = specFor(sel);
  return spec ? play(rates, spec.memory, spec.lands, spec.minutes) : null;
}

/**
 * Whether a selection landed on a game's goal timeline ([minute, added
 * time, side] in order, archive/espn-shots.ts), by the same rules the
 * estimate prices it with; null for one the process doesn't read. Added
 * time counts as the minute it was added to (45+6 is the 45th).
 */
export function landedOn(sel: SportyBetSelection, goals: readonly (readonly [number, number, "h" | "a"])[]): boolean | null {
  const spec = specFor(sel);
  if (!spec) return null;
  let s: State = { h: 0, a: 0, x: 0 };
  for (const [minute, , side] of goals) {
    if (minute > (spec.minutes ?? Infinity)) break;
    const t = side === "h" ? { h: s.h + 1, a: s.a, x: s.x } : { h: s.h, a: s.a + 1, x: s.x };
    s = { ...t, x: spec.memory(t, side, Math.max(1, Math.min(minute, 90))) };
  }
  return spec.lands(s);
}
