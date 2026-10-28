/**
 * Matchday figures for the page headers: how the last full day of picks did
 * (Picks), and what the next one should do if the stated chances hold
 * (Fixtures). Days are Lagos days, the site's own calendar. Pure.
 */

const TZ = "Africa/Lagos";
export const lagosDay = (at: number | string) => new Date(at).toLocaleDateString("en-CA", { timeZone: TZ });

export interface LoggedPick {
  kickoff: string;
  result: "win" | "lose" | "push" | null;
}

export interface MatchdayRecord {
  /** YYYY-MM-DD, Lagos. */
  day: string;
  wins: number;
  losses: number;
  pushes: number;
  /** Picks that day not graded yet (corners waiting on stats, a postponed game). */
  pending: number;
  /** Wins over wins and losses; null with none graded. */
  rate: number | null;
}

/** The most recent day before today with graded picks. Null when there is none. */
export function previousMatchday(rows: readonly LoggedPick[], now = Date.now()): MatchdayRecord | null {
  const today = lagosDay(now);
  const byDay = new Map<string, LoggedPick[]>();
  for (const r of rows) {
    const d = lagosDay(r.kickoff);
    if (d >= today) continue;
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const days = [...byDay.keys()].sort().reverse();
  for (const day of days) {
    const xs = byDay.get(day)!;
    const wins = xs.filter((x) => x.result === "win").length;
    const losses = xs.filter((x) => x.result === "lose").length;
    if (wins + losses === 0) continue;
    return {
      day,
      wins,
      losses,
      pushes: xs.filter((x) => x.result === "push").length,
      pending: xs.filter((x) => x.result === null).length,
      rate: wins / (wins + losses),
    };
  }
  return null;
}

export interface MatchdayProjection {
  day: string;
  picks: number;
  /** The sum of the stated chances: how many should land. */
  expectedWins: number;
  /** expectedWins over picks. */
  accuracy: number;
  /** About two in three days land inside this, if the chances are right (one standard deviation). */
  range: [number, number];
}

/**
 * The next matchday's picks still to kick off, projected from their stated
 * chances: each pick lands or not on its own, so the count of winners has
 * mean Σp and variance Σp(1-p).
 */
export function projectMatchday(picks: readonly { kickoff: string; probability: number }[], now = Date.now()): MatchdayProjection | null {
  const ahead = picks.filter((p) => Date.parse(p.kickoff) > now);
  if (ahead.length === 0) return null;
  const day = ahead.map((p) => lagosDay(p.kickoff)).sort()[0];
  const xs = ahead.filter((p) => lagosDay(p.kickoff) === day);
  const expectedWins = xs.reduce((s, p) => s + p.probability, 0);
  const sd = Math.sqrt(xs.reduce((s, p) => s + p.probability * (1 - p.probability), 0));
  return {
    day,
    picks: xs.length,
    expectedWins,
    accuracy: expectedWins / xs.length,
    range: [Math.max(0, Math.round(expectedWins - sd)), Math.min(xs.length, Math.round(expectedWins + sd))],
  };
}

/** "Yesterday", "Today", "Tomorrow" or "Tue 27 Oct", for a Lagos day. */
export function dayName(day: string, now = Date.now()): string {
  const today = lagosDay(now);
  const shift = (n: number) => lagosDay(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000);
  if (day === today) return "Today";
  if (day === shift(-1)) return "Yesterday";
  if (day === shift(1)) return "Tomorrow";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
