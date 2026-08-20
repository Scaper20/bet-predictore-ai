/**
 * League catalogue, ordered by how much Nigerian bettors actually care.
 *
 * The Premier League dominates Nigerian betting slips by a wide margin, so it
 * leads; NPFL and the continental competitions follow because they are the
 * home-market differentiator no global product bothers to cover well.
 */

export interface LeagueDef {
  /** Internal slug used in URLs. */
  code: string;
  name: string;
  shortName: string;
  country: string;
  flag: string;
  /** Sort weight for Nigerian audiences — lower shows first. */
  rank: number;
  ids: {
    /** football-data.org competition code. */
    footballData?: string;
    /** TheSportsDB numeric league id. */
    theSportsDb?: string;
    /** API-Football numeric league id. */
    apiFootball?: number;
  };
}

export const LEAGUES: LeagueDef[] = [
  {
    code: "premier-league",
    name: "English Premier League",
    shortName: "EPL",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rank: 1,
    ids: { footballData: "PL", theSportsDb: "4328", apiFootball: 39 },
  },
  {
    code: "champions-league",
    name: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    flag: "🇪🇺",
    rank: 2,
    ids: { footballData: "CL", theSportsDb: "4480", apiFootball: 2 },
  },
  {
    code: "la-liga",
    name: "Spanish La Liga",
    shortName: "La Liga",
    country: "Spain",
    flag: "🇪🇸",
    rank: 3,
    ids: { footballData: "PD", theSportsDb: "4335", apiFootball: 140 },
  },
  {
    code: "serie-a",
    name: "Italian Serie A",
    shortName: "Serie A",
    country: "Italy",
    flag: "🇮🇹",
    rank: 4,
    ids: { footballData: "SA", theSportsDb: "4332", apiFootball: 135 },
  },
  {
    code: "bundesliga",
    name: "German Bundesliga",
    shortName: "Bundesliga",
    country: "Germany",
    flag: "🇩🇪",
    rank: 5,
    ids: { footballData: "BL1", theSportsDb: "4331", apiFootball: 78 },
  },
  {
    code: "ligue-1",
    name: "French Ligue 1",
    shortName: "Ligue 1",
    country: "France",
    flag: "🇫🇷",
    rank: 6,
    ids: { footballData: "FL1", theSportsDb: "4334", apiFootball: 61 },
  },
  {
    code: "npfl",
    name: "Nigeria Professional Football League",
    shortName: "NPFL",
    country: "Nigeria",
    flag: "🇳🇬",
    rank: 7,
    ids: { theSportsDb: "4855", apiFootball: 399 },
  },
  {
    code: "championship",
    name: "English Championship",
    shortName: "Championship",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rank: 8,
    ids: { footballData: "ELC", theSportsDb: "4329", apiFootball: 40 },
  },
  {
    code: "eredivisie",
    name: "Dutch Eredivisie",
    shortName: "Eredivisie",
    country: "Netherlands",
    flag: "🇳🇱",
    rank: 9,
    ids: { footballData: "DED", theSportsDb: "4337", apiFootball: 88 },
  },
  {
    code: "primeira-liga",
    name: "Portuguese Primeira Liga",
    shortName: "Primeira Liga",
    country: "Portugal",
    flag: "🇵🇹",
    rank: 10,
    ids: { footballData: "PPL", theSportsDb: "4344", apiFootball: 94 },
  },
  {
    code: "caf-champions-league",
    name: "CAF Champions League",
    shortName: "CAF CL",
    country: "Africa",
    flag: "🌍",
    rank: 11,
    ids: { theSportsDb: "4552", apiFootball: 12 },
  },
  {
    code: "brasileirao",
    name: "Brazilian Série A",
    shortName: "Brasileirão",
    country: "Brazil",
    flag: "🇧🇷",
    rank: 12,
    ids: { footballData: "BSA", theSportsDb: "4351", apiFootball: 71 },
  },
];

const BY_CODE = new Map(LEAGUES.map((l) => [l.code, l]));

export function leagueByCode(code: string): LeagueDef | undefined {
  return BY_CODE.get(code);
}

/** Reverse lookup so provider payloads can be tagged with our slug. */
export function leagueByProviderId(
  provider: "footballData" | "theSportsDb" | "apiFootball",
  id: string | number | undefined | null,
): LeagueDef | undefined {
  if (id === undefined || id === null) return undefined;
  const key = String(id);
  return LEAGUES.find((l) => {
    const v = l.ids[provider];
    return v !== undefined && String(v) === key;
  });
}

export function rankLeague(code?: string): number {
  if (!code) return 999;
  return BY_CODE.get(code)?.rank ?? 999;
}
