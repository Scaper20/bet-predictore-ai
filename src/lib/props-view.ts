/**
 * Player props as pages show them, and what a free viewer may see. Facts are
 * free (who, which market, how often recent starts cleared each line); the
 * projection, the ladder's probabilities and the pick are Pro. Redaction
 * happens here, on the server, so a free viewer's HTML never carries them.
 */

import type { PropMarketKey } from "@/lib/model/player-props";
import { PROP_SPECS } from "@/lib/model/player-props";
import type { LadderRung, PropRisk } from "@/lib/model/prop-picks";

export interface PropPickView {
  line: number;
  side: "over" | "under";
  probability: number;
  marketProbability: number | null;
  price: number | null;
  risk: PropRisk;
  selection: string | null;
  published: boolean;
}

export interface PropRow {
  matchId: string;
  publicId: string;
  kickoff: string;
  leagueCode: string;
  leagueName: string;
  homeName: string;
  awayName: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  teamCrest: string | null;
  position: number | null;
  lineup: "confirmed" | "predicted";
  market: PropMarketKey;
  /** Pro: the projected count. */
  mean: number | null;
  /** Pro: the ladder with probabilities (free: empty). */
  rungs: LadderRung[];
  /** Free: this market's count in the player's last ten starts, newest first. */
  recent: number[];
  /** Pro: the pick, if one was logged. */
  pick: PropPickView | null;
  /** Free: whether a pick exists (without saying what it is). */
  hasPick: boolean;
  /** Whether the bookmaker lists any line for this player and market. */
  bookable: boolean;
  locked: boolean;
}

/** The free view of a row: no mean, no probabilities, no pick. */
export function lockRow(r: PropRow): PropRow {
  return {
    ...r,
    mean: null,
    rungs: [],
    pick: null,
    locked: true,
  };
}

export function viewProps(rows: PropRow[], paid: boolean): PropRow[] {
  return paid ? rows.map((r) => ({ ...r, locked: false })) : rows.map(lockRow);
}

/** "6 of 8": how often recent starts went over a line. */
export function clearedCount(recent: readonly number[], line: number, side: "over" | "under" = "over", n = 8): { hits: number; of: number } {
  const xs = recent.slice(0, n);
  return { hits: xs.filter((v) => (side === "over" ? v > line : v < line)).length, of: xs.length };
}

/** The line a free viewer sees facts for: the recent median's nearest half-line. */
export function factLine(recent: readonly number[], market: PropMarketKey): number {
  const step = PROP_SPECS[market].step;
  if (recent.length === 0) return 0.5;
  const xs = [...recent].sort((a, b) => a - b);
  const med = xs[Math.floor(xs.length / 2)];
  if (step === 1) return Math.max(0.5, Math.round(med) - 0.5);
  return Math.max(4.5, Math.round(med / 5) * 5 - 0.5);
}

export function pickLabel(market: PropMarketKey, line: number, side: "over" | "under"): string {
  return `${side === "over" ? "Over" : "Under"} ${line} ${PROP_SPECS[market].label.toLowerCase()}`;
}
