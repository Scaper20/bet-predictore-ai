/**
 * Normalised domain model.
 *
 * Every value that reaches the UI passes through these shapes, no matter which
 * upstream feed produced it. Nothing here is ever synthesised: if a provider
 * cannot supply a fixture we surface an empty state rather than inventing one.
 */

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  crest?: string;
}

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: string;
  /** ISO-8601 UTC kickoff. */
  kickoff: string;
  status: MatchStatus;
  /** Minutes played, when the feed exposes it for a live game. */
  minute?: number | null;
  league: LeagueRef;
  home: Team;
  away: Team;
  score: Score;
  halftime?: Score;
  venue?: string | null;
  round?: string | null;
  /** Which adapter produced this record — shown in the data-source footer. */
  source: ProviderId;
}

export interface LeagueRef {
  id: string;
  name: string;
  country?: string;
  logo?: string;
  /** Stable internal slug used in URLs and the league catalogue. */
  code?: string;
}

export interface StandingRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export type ProviderId = "football-data" | "thesportsdb" | "api-football";

export interface ProviderHealth {
  id: ProviderId;
  label: string;
  configured: boolean;
  /** Coverage note shown in the UI so users know what they are getting. */
  note: string;
}

/** A completed match used as model training data. */
export interface ResultRow {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  /** Epoch ms — drives recency weighting in the fit. */
  date: number;
  leagueId: string;
}
