import type { LineRow } from "@/lib/sportybet-lines";

/**
 * SportyBet's extra lines laid out the way a bettor reads them: one table
 * per question, one row per line, every side of the line side by side
 * (over beside under, one team's handicap beside the other's), instead of a
 * flat list of selections. Pure.
 */

export interface LineCell {
  market: string;
  /** Chance it wins outright. */
  win: number;
  /** Chance the stake (or half of it) comes back: whole and quarter lines. */
  refund: number;
  price: number | null;
  /** SportyBet pays more than the model's break-even price. */
  value: boolean;
}

export interface LineTable {
  key: string;
  title: string;
  /** What the line column means ("Celtic's line", "Line"); empty for a table with one row. */
  lineLabel: string;
  sides: string[];
  rows: { line: string; cells: (LineCell | null)[] }[];
}

/** A price this far over break-even reads as value; less is rounding. */
const VALUE_EDGE = 1.02;

const num = (s: string) => Number(s);
const signed = (x: number) => (x > 0 ? `+${x}` : x === 0 ? "0" : String(x));
const NOUN: Record<string, string> = { corners: "corners", shots: "shots", sot: "shots on target", bookings: "bookings" };

function cell(r: LineRow): LineCell {
  return {
    market: r.market,
    win: Math.max(0, r.probability - r.refund),
    refund: r.refund,
    price: r.price,
    value: r.price !== null && Number.isFinite(r.fair) && r.price > r.fair * VALUE_EDGE,
  };
}

interface Slot {
  table: string;
  title: string;
  lineLabel: string;
  sides: string[];
  side: number;
  /** The row's line, written from the first side's point of view. */
  line: number | null;
}

/** Where a selection sits: which table, which column, which row. */
function slotOf(market: string, home: string, away: string): Slot | null {
  const p = market.split(":");
  const team = (s: string) => (s === "home" ? home : away);
  const teams = [home, away];
  if (p[0] === "ah" && p.length === 3) {
    // Rows by the home side's line; the away side at +L is the home side at -L.
    const line = num(p[2]);
    return { table: "ah", title: "Handicap", lineLabel: `${home}'s line`, sides: teams, side: p[1] === "home" ? 0 : 1, line: p[1] === "home" ? line : -line };
  }
  if (p[0] === "eh" && p.length === 3) {
    return { table: "eh", title: "3-way handicap", lineLabel: `${home}'s head start`, sides: [home, "Draw", away], side: ["home", "draw", "away"].indexOf(p[1]), line: num(p[2]) };
  }
  if (p[0] === "tg" && p.length === 4) {
    return { table: `tg:${p[1]}`, title: `${team(p[1])} goals`, lineLabel: "Goals", sides: ["Over", "Under"], side: p[2] === "over" ? 0 : 1, line: num(p[3]) };
  }
  const noun = NOUN[p[0]];
  if (!noun) return null;
  const cap = noun[0].toUpperCase() + noun.slice(1);
  if ((p[1] === "over" || p[1] === "under") && p.length === 3) {
    return { table: `${p[0]}:total`, title: `Total ${noun}`, lineLabel: cap, sides: ["Over", "Under"], side: p[1] === "over" ? 0 : 1, line: num(p[2]) };
  }
  if ((p[1] === "home" || p[1] === "away") && (p[2] === "over" || p[2] === "under") && p.length === 4) {
    return { table: `${p[0]}:${p[1]}`, title: `${team(p[1])} ${noun}`, lineLabel: cap, sides: ["Over", "Under"], side: p[2] === "over" ? 0 : 1, line: num(p[3]) };
  }
  if (p[1] === "hcp" && p.length === 4) {
    const line = num(p[3]);
    return { table: `${p[0]}:hcp`, title: `${cap} handicap`, lineLabel: `${home}'s line`, sides: teams, side: p[2] === "home" ? 0 : 1, line: p[2] === "home" ? line : -line };
  }
  if (p[1] === "most" && p.length === 3) {
    const order = ["home", "level", "away"];
    const side = order.indexOf(p[2]);
    if (side < 0) return null;
    return { table: `${p[0]}:most`, title: `Most ${noun}`, lineLabel: "", sides: [home, "Level", away], side, line: null };
  }
  return null;
}

/** The group's rows as tables, in the order their first selection came. Rows by line, lowest first. */
export function lineTables(rows: readonly LineRow[], home: string, away: string): LineTable[] {
  const tables = new Map<string, { t: LineTable; byLine: Map<string, (LineCell | null)[]>; lines: Map<string, number> }>();
  for (const r of rows) {
    const s = slotOf(r.market, home, away);
    if (!s) continue;
    let entry = tables.get(s.table);
    if (!entry) {
      entry = { t: { key: s.table, title: s.title, lineLabel: s.lineLabel, sides: s.sides, rows: [] }, byLine: new Map(), lines: new Map() };
      tables.set(s.table, entry);
    }
    const key = s.line === null ? "" : String(s.line);
    if (!entry.byLine.has(key)) {
      entry.byLine.set(key, s.sides.map(() => null));
      entry.lines.set(key, s.line ?? 0);
    }
    entry.byLine.get(key)![s.side] = cell(r);
  }
  return [...tables.values()].map(({ t, byLine, lines }) => ({
    ...t,
    rows: [...byLine.entries()]
      .sort((a, b) => lines.get(a[0])! - lines.get(b[0])!)
      .map(([k, cells]) => ({ line: k === "" ? "" : t.lineLabel.endsWith("line") || t.lineLabel.endsWith("head start") ? signed(Number(k)) : k, cells })),
  }));
}
