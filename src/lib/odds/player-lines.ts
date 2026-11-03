/**
 * Bookmaker player lines, read from one event's markets, and the platform
 * layer the props feed books through. Pure (no I/O), so it is tested on saved
 * payloads.
 *
 * SportyBet (Sportradar feed) lists each player's market as its own market
 * row: specifier `variant=pre:playerprops:<n>:<playerId>` (market census,
 * docs/sportybet-markets.md). Two outcome shapes are read:
 *
 *   thresholds   outcomes "Name 2+" / "2+": over (n - 0.5) only
 *   over/under   outcomes "Over 1.5" / "Under 1.5", the line in the outcome
 *                or a `total=` specifier: both sides
 *
 * The player's name comes from the outcome or market description. Anything
 * else is skipped and counted, so a change of shape shows up on Data health
 * instead of as wrong lines.
 *
 * NOTE: the outcome shape has not yet been checked against a live capture
 * (SportyBet refuses this build environment); see docs/player-props.md.
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
  "780": "tackles",
  "800291": "fouls",
  "800297": "saves",
  "778": "passes",
};

export type Platform = "sportybet";

export interface PlayerLine {
  platform: Platform;
  market: PropMarketKey;
  platformMarket: string;
  specifier: string;
  line: number;
  playerId: string | null;
  playerName: string;
  overOdds: number | null;
  underOdds: number | null;
  overOutcome: string | null;
  underOutcome: string | null;
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

function clean(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[\s,-]+$/, "").trim().slice(0, 120);
}

const THRESHOLD = /^(.*?)\s*(\d{1,3})\s*\+\s*$/;
const OVER_UNDER = /^(?:(.*?)\s+)?(over|under)\s+(\d{1,3}(?:\.5)?)\s*$/i;

/** Player lines in one event's markets. */
export function parsePlayerLines(markets: readonly RawMarket[] | null | undefined): ParsedLines {
  const lines: PlayerLine[] = [];
  let skipped = 0;
  for (const m of markets ?? []) {
    const id = String(m.market_id ?? "");
    const market = SPORTYBET_PROP_MARKETS[id];
    if (!market) continue;
    const spec = m.specifier ?? "";
    const playerId = playerIdOf(spec);
    const total = Number(specParts(spec).total);
    const byLine = new Map<number, PlayerLine>();
    let understood = 0;
    for (const o of m.outcomes ?? []) {
      const desc = (o.desc ?? "").trim();
      const oid = o.id !== undefined ? String(o.id) : null;
      const odds = num(o.odds);
      const th = THRESHOLD.exec(desc);
      const ou = th ? null : OVER_UNDER.exec(desc);
      let line: number | null = null;
      let side: "over" | "under" | null = null;
      let name = "";
      if (th) {
        line = Number(th[2]) - 0.5;
        side = "over";
        name = th[1];
      } else if (ou) {
        line = ou[3].includes(".") ? Number(ou[3]) : Number.isFinite(total) ? total : Number(ou[3]) - 0.5;
        side = ou[2].toLowerCase() === "over" ? "over" : "under";
        name = ou[1] ?? "";
      } else if (/^over$/i.test(desc) || /^under$/i.test(desc)) {
        if (Number.isFinite(total)) {
          line = total;
          side = /^over$/i.test(desc) ? "over" : "under";
        }
      }
      if (line === null || side === null || line < 0.5 || line > 200) continue;
      const playerName = clean(name || m.desc || "");
      if (!playerName) continue;
      understood++;
      const cur = byLine.get(line) ?? {
        platform: "sportybet" as const, market, platformMarket: id, specifier: spec, line, playerId,
        playerName, overOdds: null, underOdds: null, overOutcome: null, underOutcome: null,
      };
      if (side === "over") {
        cur.overOdds = odds;
        cur.overOutcome = oid;
      } else {
        cur.underOdds = odds;
        cur.underOutcome = oid;
      }
      byLine.set(line, cur);
    }
    if (understood === 0) skipped++;
    for (const l of byLine.values()) if (l.overOdds !== null || l.underOdds !== null) lines.push(l);
  }
  return { lines, skipped };
}

/** The booking selection for one side of a line (the raw: path, src/lib/odds/markets.ts). */
export function bookingSelection(l: PlayerLine, side: "over" | "under"): string | null {
  const outcome = side === "over" ? l.overOutcome : l.underOutcome;
  if (!outcome) return null;
  return rawMarket({ marketId: l.platformMarket, outcomeId: outcome, ...(l.specifier ? { specifier: l.specifier } : {}) });
}

/** The bookmaker's own chance for a side, margin removed when both sides are priced. */
export function impliedChance(l: PlayerLine, side: "over" | "under"): number | null {
  const o = l.overOdds ? 1 / l.overOdds : null;
  const u = l.underOdds ? 1 / l.underOdds : null;
  if (o !== null && u !== null) return (side === "over" ? o : u) / (o + u);
  const v = side === "over" ? o : u;
  // One side only: take ~7% margin off, typical of SportyBet's player markets.
  return v === null ? null : Math.min(0.99, v / 1.07);
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
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

export interface SquadPlayer {
  id: string;
  name: string;
}

/**
 * Our player for a bookmaker's name, looked up only among the two squads in
 * the game: full name, then "initial surname" / surname alone when exactly one
 * player matches. Ambiguous or unknown names stay unmatched.
 */
export function matchPlayer(name: string, squad: readonly SquadPlayer[]): SquadPlayer | null {
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
  return contains.length === 1 ? contains[0] : null;
}
