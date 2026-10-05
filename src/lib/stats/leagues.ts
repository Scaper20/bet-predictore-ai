import { CLUB_LEAGUES, type LeagueDef } from "@/lib/leagues";

/** Club competitions the stats pages offer, catalogue order. */
export const STAT_LEAGUES = CLUB_LEAGUES.map((l) => ({ code: l.code, label: l.shortName, flag: l.flag }));

/** The league to show when none is asked for, or an unknown one is. */
export function pickLeague(code: string | undefined, allowed = STAT_LEAGUES.map((l) => l.code)): string {
  return code && allowed.includes(code) ? code : allowed[0];
}

/**
 * Where a competition's Elo lives in elo_ratings: its country, the cup's own
 * code, or "international" (the same rule as the ingestion elo job).
 */
export function ratingScope(def: LeagueDef): string {
  if (def.confederation) return "international";
  const country = def.country.toLowerCase();
  return ["europe", "africa", "world", "south america", "north america"].includes(country) ? def.code : country;
}
