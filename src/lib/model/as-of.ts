import type { ResultRow } from "@/lib/types";
import { normaliseKey } from "./fit";

const SAME_GAME_MS = 36 * 3_600_000;

/**
 * The training rows as they stood at a fixture's kickoff.
 *
 * A match page for a game that has been played used to refit on every result
 * the archive holds, that game's own score included, so the pre-match chances
 * it showed had the answer in them (audit, Nov 2026, A1). Rows at or after
 * kickoff are dropped, and so is the fixture's own row when the archive stamps
 * it earlier in the day than the feed's kickoff (a date-only stamp).
 *
 * For a game still to be played every row is already earlier, and the same
 * array comes back, so the shared fit cache (service.ts sharedFit) is untouched.
 */
export function trainingAsOf(
  rows: ResultRow[],
  kickoff: number,
  home: readonly string[],
  away: readonly string[],
): ResultRow[] {
  if (!Number.isFinite(kickoff)) return rows;
  const h = new Set(home.map(normaliseKey));
  const a = new Set(away.map(normaliseKey));
  const isSelf = (r: ResultRow) =>
    Math.abs(r.date - kickoff) < SAME_GAME_MS && h.has(normaliseKey(r.homeName)) && a.has(normaliseKey(r.awayName));
  let leaks = false;
  for (const r of rows) {
    if (r.date >= kickoff || isSelf(r)) {
      leaks = true;
      break;
    }
  }
  return leaks ? rows.filter((r) => r.date < kickoff && !isSelf(r)) : rows;
}
