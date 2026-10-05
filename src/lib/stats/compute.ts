/**
 * Pure arithmetic behind the stats pages: form, goal rates, streaks, the
 * live table and the 1-10 rating scale. No I/O here, so every rule the pages
 * show a number from is unit-tested (compute.test.ts).
 */

import type { Match, StandingRow } from "@/lib/types";

/** One finished game from one club's side. */
export interface TeamResult {
  matchId: string;
  leagueCode: string;
  kickoff: string;
  isHome: boolean;
  opponentId: string | null;
  opponentName: string;
  opponentCrest?: string;
  goalsFor: number;
  goalsAgainst: number;
  /** The id a match page knows this game by (fd:/sdb:/db:). */
  publicId: string;
}

export type Outcome = "W" | "D" | "L";

export function outcome(r: Pick<TeamResult, "goalsFor" | "goalsAgainst">): Outcome {
  return r.goalsFor > r.goalsAgainst ? "W" : r.goalsFor < r.goalsAgainst ? "L" : "D";
}

const POINTS: Record<Outcome, number> = { W: 3, D: 1, L: 0 };

export interface FormSummary {
  played: number;
  /** Most recent first. */
  letters: Outcome[];
  won: number;
  drawn: number;
  lost: number;
  points: number;
  /** Points per game, 0-3. */
  ppg: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  failedToScore: number;
  /** Points per game in the latest half of the window minus the earlier half. */
  trend: number;
}

/** Form over a club's results, most recent first. */
export function summariseForm(results: TeamResult[]): FormSummary {
  const letters = results.map(outcome);
  const won = letters.filter((l) => l === "W").length;
  const drawn = letters.filter((l) => l === "D").length;
  const lost = letters.length - won - drawn;
  const points = letters.reduce((n, l) => n + POINTS[l], 0);
  const half = Math.floor(letters.length / 2);
  const ppgOf = (ls: Outcome[]) => (ls.length ? ls.reduce((n, l) => n + POINTS[l], 0) / ls.length : 0);
  return {
    played: results.length,
    letters,
    won,
    drawn,
    lost,
    points,
    ppg: results.length ? points / results.length : 0,
    goalsFor: results.reduce((n, r) => n + r.goalsFor, 0),
    goalsAgainst: results.reduce((n, r) => n + r.goalsAgainst, 0),
    cleanSheets: results.filter((r) => r.goalsAgainst === 0).length,
    failedToScore: results.filter((r) => r.goalsFor === 0).length,
    trend: half >= 2 ? ppgOf(letters.slice(0, half)) - ppgOf(letters.slice(half, half * 2)) : 0,
  };
}

export interface GoalProfile {
  played: number;
  /** Share of games, 0-1. */
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  cleanSheets: number;
  failedToScore: number;
  /** Per game. */
  scored: number;
  conceded: number;
  totalGoals: number;
}

export function goalProfile(results: TeamResult[]): GoalProfile {
  const n = results.length;
  const share = (f: (r: TeamResult) => boolean) => (n ? results.filter(f).length / n : 0);
  const gf = results.reduce((a, r) => a + r.goalsFor, 0);
  const ga = results.reduce((a, r) => a + r.goalsAgainst, 0);
  return {
    played: n,
    over15: share((r) => r.goalsFor + r.goalsAgainst > 1.5),
    over25: share((r) => r.goalsFor + r.goalsAgainst > 2.5),
    over35: share((r) => r.goalsFor + r.goalsAgainst > 3.5),
    btts: share((r) => r.goalsFor > 0 && r.goalsAgainst > 0),
    cleanSheets: share((r) => r.goalsAgainst === 0),
    failedToScore: share((r) => r.goalsFor === 0),
    scored: n ? gf / n : 0,
    conceded: n ? ga / n : 0,
    totalGoals: n ? (gf + ga) / n : 0,
  };
}

/* ---------------------------------------------------------------- streaks */

export type StreakKind =
  | "winning"
  | "unbeaten"
  | "losing"
  | "winless"
  | "over25"
  | "btts"
  | "cleanSheets"
  | "noGoals";

export interface Streak {
  kind: StreakKind;
  /** Games in a row from the most recent backwards ("won the last 6")... */
  run: number;
  /** ...or a count within the window ("Over 2.5 in 8 of the last 10"). */
  of: number;
  /** True when `run` games in a row; false for "x of the last n". */
  consecutive: boolean;
  /** Higher is more remarkable; ranks trends across clubs. */
  strength: number;
}

const STREAK_TESTS: Record<StreakKind, (r: TeamResult) => boolean> = {
  winning: (r) => outcome(r) === "W",
  unbeaten: (r) => outcome(r) !== "L",
  losing: (r) => outcome(r) === "L",
  winless: (r) => outcome(r) !== "W",
  over25: (r) => r.goalsFor + r.goalsAgainst > 2.5,
  btts: (r) => r.goalsFor > 0 && r.goalsAgainst > 0,
  cleanSheets: (r) => r.goalsAgainst === 0,
  noGoals: (r) => r.goalsFor === 0,
};

/**
 * How often each test is true for an average club, roughly, across the
 * leagues BetriX covers. A run of something common (unbeaten) has to be
 * longer than a run of something rare (clean sheets) to rank as high.
 */
const BASE_RATE: Record<StreakKind, number> = {
  winning: 0.38,
  unbeaten: 0.62,
  losing: 0.33,
  winless: 0.62,
  over25: 0.5,
  btts: 0.5,
  cleanSheets: 0.3,
  noGoals: 0.25,
};

/** Shortest run worth showing, per kind. */
const MIN_RUN: Record<StreakKind, number> = {
  winning: 4,
  unbeaten: 6,
  losing: 4,
  winless: 6,
  over25: 5,
  btts: 5,
  cleanSheets: 3,
  noGoals: 3,
};

/**
 * Every notable streak in a club's recent results (most recent first).
 *
 * A run counts back from the latest game until the test fails. Where there is
 * no long run, a dense window still counts ("Over 2.5 in 8 of the last 10"),
 * for the goal markets only: "won 7 of the last 10" is form, not a streak.
 *
 * Strength is the run's surprise in bits, -log2(p^run): an unlikely sequence
 * scores high whatever its kind, so the trends page ranks one list instead
 * of eight.
 */
export function findStreaks(results: TeamResult[]): Streak[] {
  const out: Streak[] = [];
  for (const kind of Object.keys(STREAK_TESTS) as StreakKind[]) {
    const test = STREAK_TESTS[kind];
    let run = 0;
    while (run < results.length && test(results[run])) run++;
    const p = BASE_RATE[kind];
    if (run >= MIN_RUN[kind]) {
      out.push({ kind, run, of: run, consecutive: true, strength: -run * Math.log2(p) });
      continue;
    }
    if ((kind === "over25" || kind === "btts") && results.length >= 8) {
      const window = results.slice(0, 10);
      const hits = window.filter(test).length;
      if (hits / window.length >= 0.8) {
        out.push({ kind, run: hits, of: window.length, consecutive: false, strength: -hits * Math.log2(p) * 0.8 });
      }
    }
  }
  // "Unbeaten in 6" says less than "won 6" when both hold; keep the stronger one.
  const has = (k: StreakKind) => out.some((s) => s.kind === k);
  return out.filter((s) => !(s.kind === "unbeaten" && has("winning")) && !(s.kind === "winless" && has("losing")));
}

/* ------------------------------------------------------------ live table */

export interface LiveStandingRow extends StandingRow {
  /** Positions gained (+) or lost (-) against the last official table. */
  movement: number;
  /** Set when this club is playing right now. */
  live?: { matchId: string; minute: number | null; for: number; against: number; halftime: boolean };
}

/**
 * The table as it would stand if every game in play ended now.
 *
 * Each live game's current score is added to both clubs' rows (a game in
 * play is not in the official standings yet), then the table is re-sorted on
 * points, goal difference and goals scored. Clubs are matched on team id,
 * falling back to a normalised name for rows written by another feed.
 */
export function applyLiveScores(table: StandingRow[], live: Match[]): LiveStandingRow[] {
  const keyOf = (name: string) => name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const byId = new Map(table.map((r) => [r.team.id, r]));
  const byName = new Map(table.map((r) => [keyOf(r.team.name), r]));
  const find = (t: Match["home"]) => byId.get(t.id) ?? byName.get(keyOf(t.name));

  const rows: LiveStandingRow[] = table.map((r) => ({ ...r, movement: 0 }));
  const rowOf = new Map(rows.map((r) => [r.team.id, r]));

  for (const m of live) {
    if (m.status !== "live" && m.status !== "halftime") continue;
    const h = find(m.home);
    const a = find(m.away);
    if (!h || !a) continue;
    const hs = m.score.home ?? 0;
    const as = m.score.away ?? 0;
    const apply = (row: LiveStandingRow | undefined, gf: number, ga: number) => {
      if (!row) return;
      row.played += 1;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      row.goalDifference += gf - ga;
      if (gf > ga) {
        row.won += 1;
        row.points += 3;
      } else if (gf === ga) {
        row.drawn += 1;
        row.points += 1;
      } else row.lost += 1;
      row.live = { matchId: m.id, minute: m.minute ?? null, for: gf, against: ga, halftime: m.status === "halftime" };
    };
    apply(rowOf.get(h.team.id), hs, as);
    apply(rowOf.get(a.team.id), as, hs);
  }

  if (!rows.some((r) => r.live)) return rows;

  const sorted = [...rows].sort(
    (x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor || x.position - y.position,
  );
  return sorted.map((r, i) => ({ ...r, movement: r.position - (i + 1), position: i + 1 }));
}

/* ---------------------------------------------------------------- ratings */

/**
 * An Elo rating on a 1-10 scale.
 *
 * 1500 is where every club starts and the average of its league, so it maps
 * to 5.5, the middle of the scale; each 55 Elo points is one step. The
 * strongest clubs in Europe's top leagues sit near 1,800-1,850, which lands
 * just under 10 — the cap — and the weakest near 1,250, about 1. Ratings are
 * relative to a club's own league: each league's Elo is fitted on its own
 * games, so a 7 in the NPFL and a 7 in the Premier League are each a 7
 * against their own opposition.
 */
export function ratingScore(elo: number): number {
  const score = 5.5 + (elo - 1500) / 55;
  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

/** Colour for a 1-10 rating: red through amber to green, in OKLCH so the steps look even. */
export function ratingHue(score: number): number {
  const t = (Math.min(10, Math.max(1, score)) - 1) / 9;
  return Math.round(25 + t * 125);
}

export function ratingColor(score: number, lightness = 0.74): string {
  return `oklch(${lightness} 0.16 ${ratingHue(score)})`;
}

export function ratingBand(score: number): string {
  if (score >= 8.5) return "Elite";
  if (score >= 7) return "Strong";
  if (score >= 5.5) return "Above average";
  if (score >= 4) return "Average";
  if (score >= 2.5) return "Weak";
  return "Struggling";
}
