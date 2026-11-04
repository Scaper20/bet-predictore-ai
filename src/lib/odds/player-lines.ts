/**
 * Bookmaker player lines, read from one event's markets, and the platform
 * layer the props feed books through. Pure (no I/O), tested on a real capture
 * (__fixtures__/sportybet-player-props.json, Atletico v Bayern, 3 Nov 2026).
 *
 * SportyBet's player markets (Sportradar feed), as captured:
 *
 *   per player   770 assists, 775 goals, 776 shots, 777 shots on target,
 *                778 passes, 780 tackles: one market row per player,
 *                specifier `variant=pre:playerprops:<event>:<playerId>`
 *   all players  800291 fouls, 800297 saves, 800289 to score or assist: one
 *                row, every player's outcomes in it, no specifier
 *
 * Outcomes are thresholds, over only: "Kane, Harry (Bayern Munich) 26+" is
 * over 25.5. "To score or assist" has no threshold (over 0.5). The player id
 * is the fourth part of the outcome id (`pre:playerprops:<event>:<player>:..`).
 * Each outcome carries SportyBet's own fair chance (`probability`, margin
 * out); its prices carry a heavy margin (often 10-30% on these markets).
 * Over/under outcomes are read too, should a market ever list them. Anything
 * else is skipped and counted (Data health).
 */

import type { PropMarketKey } from "@/lib/model/player-props";
import { rawMarket } from "./markets";
import type { RawMarket } from "./sportybet-api";

/** SportyBet market id -> our market. Clearances has no SportyBet market. */
export const SPORTYBET_PROP_MARKETS: Record<string, PropMarketKey> = {
  "775": "goals",
  "770": "assists",
  "776": "shots",
  "777": "shotsOnTarget",
  "778": "passes",
  "780": "tackles",
  "800291": "fouls",
  "800297": "saves",
  "800289": "goalsAssists",
};

/** Markets whose outcomes are yes/no for one player ("to score or assist"): over 0.5. */
const YES_ONLY = new Set(["800289"]);

export type Platform = "sportybet";

export interface PlayerLine {
  platform: Platform;
  market: PropMarketKey;
  platformMarket: string;
  specifier: string;
  line: number;
  playerId: string | null;
  playerName: string;
  /** The club in brackets after the name, when the bookmaker gives one. */
  teamName: string | null;
  overOdds: number | null;
  underOdds: number | null;
  overOutcome: string | null;
  underOutcome: string | null;
  /** The bookmaker's own fair chance per side, when it publishes one. */
  overChance?: number | null;
  underChance?: number | null;
}

export interface ParsedLines {
  lines: PlayerLine[];
  /** Player-prop markets seen but not understood (shape drift). */
  skipped: number;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 1 ? n : null;
}

function chance(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
}

function specParts(spec: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (spec ?? "").split("|")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** The bookmaker's player id from `variant=pre:playerprops:<n>:<playerId>`. */
export function playerIdOf(spec: string | null | undefined): string | null {
  const v = specParts(spec).variant ?? "";
  const m = /playerprops:\d+:(\d+)$/.exec(v);
  return m ? m[1] : null;
}

/** The player id inside an outcome id (`pre:playerprops:<event>:<player>:...`). */
function outcomePlayerId(oid: string | null): string | null {
  const m = oid ? /^pre:playerprops:\d+:(\d+)(?::|$)/.exec(oid) : null;
  return m ? m[1] : null;
}

/** "Kane, Harry (Bayern Munich)" -> { name: "Harry Kane", team: "Bayern Munich" }. */
export function splitPlayer(raw: string): { name: string; team: string | null } {
  let s = raw.replace(/\s+/g, " ").trim();
  let team: string | null = null;
  const t = /^(.*?)\s*\(([^()]+)\)$/.exec(s);
  if (t) {
    s = t[1].trim();
    team = t[2].trim() || null;
  }
  const c = /^([^,]+),\s*(.+)$/.exec(s);
  if (c) s = `${c[2].trim()} ${c[1].trim()}`;
  return { name: s.replace(/[\s,-]+$/, "").slice(0, 120), team };
}

const THRESHOLD = /^(.*?)\s*(\d{1,3})\s*\+$/;
const OVER_UNDER = /^(?:(.*?)\s+)?(over|under)\s+(\d{1,3}(?:\.5)?)$/i;

/** Player lines in one event's markets. */
export function parsePlayerLines(markets: readonly RawMarket[] | null | undefined): ParsedLines {
  const lines: PlayerLine[] = [];
  let skipped = 0;
  for (const m of markets ?? []) {
    const id = String(m.market_id ?? "");
    const market = SPORTYBET_PROP_MARKETS[id];
    if (!market) continue;
    const spec = m.specifier ?? "";
    const specPlayer = playerIdOf(spec);
    const total = Number(specParts(spec).total);
    const byKey = new Map<string, PlayerLine>();
    let understood = 0;
    for (const o of m.outcomes ?? []) {
      const desc = (o.desc ?? "").replace(/\s+/g, " ").trim();
      const oid = o.id !== undefined ? String(o.id) : null;
      let line: number | null = null;
      let side: "over" | "under" | null = null;
      let who = "";
      const th = THRESHOLD.exec(desc);
      const ou = th ? null : OVER_UNDER.exec(desc);
      if (YES_ONLY.has(id) && desc && !th) {
        line = 0.5;
        side = "over";
        who = desc;
      } else if (th) {
        line = Number(th[2]) - 0.5;
        side = "over";
        who = th[1];
      } else if (ou) {
        line = ou[3].includes(".") ? Number(ou[3]) : Number.isFinite(total) ? total : Number(ou[3]) - 0.5;
        side = ou[2].toLowerCase() === "over" ? "over" : "under";
        who = ou[1] ?? "";
      } else if ((/^over$/i.test(desc) || /^under$/i.test(desc)) && Number.isFinite(total)) {
        line = total;
        side = /^over$/i.test(desc) ? "over" : "under";
      }
      if (line === null || side === null || line < 0.5 || line > 200) continue;
      const { name, team } = splitPlayer(who || m.desc || "");
      if (!name) continue;
      const playerId = outcomePlayerId(oid) ?? specPlayer;
      understood++;
      const key = `${playerId ?? name}|${line}`;
      const cur = byKey.get(key) ?? {
        platform: "sportybet" as const, market, platformMarket: id, specifier: spec, line, playerId,
        playerName: name, teamName: team, overOdds: null, underOdds: null, overOutcome: null, underOutcome: null,
        overChance: null, underChance: null,
      };
      if (side === "over") {
        cur.overOdds = num(o.odds);
        cur.overOutcome = oid;
        cur.overChance = chance(o.probability);
      } else {
        cur.underOdds = num(o.odds);
        cur.underOutcome = oid;
        cur.underChance = chance(o.probability);
      }
      byKey.set(key, cur);
    }
    if (understood === 0) skipped++;
    for (const l of byKey.values()) if (l.overOdds !== null || l.underOdds !== null) lines.push(l);
  }
  return { lines, skipped };
}

/** The booking selection for one side of a line (the raw: path, src/lib/odds/markets.ts). */
export function bookingSelection(l: PlayerLine, side: "over" | "under"): string | null {
  const outcome = side === "over" ? l.overOutcome : l.underOutcome;
  if (!outcome) return null;
  return rawMarket({ marketId: l.platformMarket, outcomeId: outcome, ...(l.specifier ? { specifier: l.specifier } : {}) });
}

/**
 * The bookmaker's own chance for a side: its published fair chance when it
 * gives one; else the price with the margin removed (both sides priced), or
 * with a typical margin taken off (one side).
 */
export function impliedChance(l: PlayerLine, side: "over" | "under"): number | null {
  const own = side === "over" ? l.overChance : l.underChance;
  if (own) return own;
  const o = l.overOdds ? 1 / l.overOdds : null;
  const u = l.underOdds ? 1 / l.underOdds : null;
  if (o !== null && u !== null) return (side === "over" ? o : u) / (o + u);
  const v = side === "over" ? o : u;
  return v === null ? null : Math.min(0.99, v / 1.15);
}

/**
 * The platform layer: everything downstream asks the adapter for lines and
 * selections, so another bookmaker is one new adapter.
 */
export interface PlatformAdapter {
  platform: Platform;
  label: string;
  parse(markets: readonly RawMarket[] | null | undefined): ParsedLines;
  selection(line: PlayerLine, side: "over" | "under"): string | null;
}

export const SPORTYBET_ADAPTER: PlatformAdapter = {
  platform: "sportybet",
  label: "SportyBet",
  parse: parsePlayerLines,
  selection: bookingSelection,
};

/** Normalised name for matching a bookmaker's player to ours. */
const LETTERS: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", đ: "d", ð: "d", ł: "l", þ: "th", ı: "i" };

export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[øæœßđðłþı]/g, (c) => LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bigram overlap of two strings, 0..1 (Dice). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const A = grams(a), B = grams(b);
  let both = 0;
  for (const [g, n] of A) both += Math.min(n, B.get(g) ?? 0);
  return (2 * both) / (a.length - 1 + b.length - 1);
}

export interface SquadPlayer {
  id: string;
  name: string;
  /** The player's club name, to narrow a match when the bookmaker names the club. */
  team?: string;
}

/** Whether two club names are the same club ("Atletico Madrid" / "Atlético de Madrid", "Bayern Munich" / "FC Bayern München"). */
export function sameClub(a: string, b: string): boolean {
  const words = (s: string) => new Set(nameKey(s).split(" ").filter((w) => w.length >= 4 && !["club", "football", "calcio"].includes(w)));
  const A = words(a), B = words(b);
  for (const w of A) if (B.has(w)) return true;
  const ka = nameKey(a).replace(/ /g, ""), kb = nameKey(b).replace(/ /g, "");
  return ka.length > 3 && kb.length > 3 && (ka.includes(kb) || kb.includes(ka));
}

/**
 * Our player for a bookmaker's name, looked up only among the two squads in
 * the game: full name, then "initial surname" / surname alone when exactly one
 * player matches. Ambiguous or unknown names stay unmatched.
 */
export function matchPlayer(name: string, all: readonly SquadPlayer[], team?: string | null): SquadPlayer | null {
  const side = team ? all.filter((p) => p.team && sameClub(p.team, team)) : [];
  const squad = side.length ? side : all;
  const k = nameKey(name);
  if (!k) return null;
  const full = squad.filter((p) => nameKey(p.name) === k);
  if (full.length === 1) return full[0];
  const parts = k.split(" ");
  const last = parts[parts.length - 1];
  const initial = parts.length > 1 && parts[0].length <= 2 ? parts[0][0] : null;
  const byLast = squad.filter((p) => {
    const q = nameKey(p.name).split(" ");
    if (q[q.length - 1] !== last && !nameKey(p.name).endsWith(` ${parts.slice(1).join(" ")}`)) return false;
    return initial ? q[0]?.[0] === initial : true;
  });
  if (byLast.length === 1) return byLast[0];
  // One-word names (Rodri, Vinicius Junior's "Vinicius Jr") and reversed orders
  const contains = squad.filter((p) => nameKey(p.name).split(" ").includes(k) || k.split(" ").every((w) => nameKey(p.name).includes(w)));
  if (contains.length === 1) return contains[0];
  // Spelling and transliteration (Matvienko / Matviyenko): one close surname,
  // and the same first initial when both names have one.
  const close = squad.filter((p) => {
    const q = nameKey(p.name).split(" ");
    if (similarity(q[q.length - 1], last) < 0.8) return false;
    return parts.length < 2 || q.length < 2 || q[0][0] === parts[0][0];
  });
  return close.length === 1 ? close[0] : null;
}
