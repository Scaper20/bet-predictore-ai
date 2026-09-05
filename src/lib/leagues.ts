/**
 * League catalogue, ordered by how much Nigerian bettors actually care.
 *
 * The Premier League dominates Nigerian betting slips by a wide margin, so it
 * leads; NPFL and the continental competitions follow because they are the
 * home-market differentiator no global product bothers to cover well.
 */

import type { SportId } from "@/lib/sports";

export interface LeagueDef {
  /** Internal slug used in URLs. */
  code: string;
  /** Which sport this competition belongs to — see src/lib/sports.ts. */
  sport: SportId;
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
    sport: "football",
    name: "English Premier League",
    shortName: "EPL",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rank: 1,
    ids: { footballData: "PL", theSportsDb: "4328", apiFootball: 39 },
  },
  {
    code: "champions-league",
    sport: "football",
    name: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    flag: "🇪🇺",
    rank: 2,
    ids: { footballData: "CL", theSportsDb: "4480", apiFootball: 2 },
  },
  {
    code: "la-liga",
    sport: "football",
    name: "Spanish La Liga",
    shortName: "La Liga",
    country: "Spain",
    flag: "🇪🇸",
    rank: 3,
    ids: { footballData: "PD", theSportsDb: "4335", apiFootball: 140 },
  },
  {
    code: "serie-a",
    sport: "football",
    name: "Italian Serie A",
    shortName: "Serie A",
    country: "Italy",
    flag: "🇮🇹",
    rank: 4,
    ids: { footballData: "SA", theSportsDb: "4332", apiFootball: 135 },
  },
  {
    code: "bundesliga",
    sport: "football",
    name: "German Bundesliga",
    shortName: "Bundesliga",
    country: "Germany",
    flag: "🇩🇪",
    rank: 5,
    ids: { footballData: "BL1", theSportsDb: "4331", apiFootball: 78 },
  },
  {
    code: "ligue-1",
    sport: "football",
    name: "French Ligue 1",
    shortName: "Ligue 1",
    country: "France",
    flag: "🇫🇷",
    rank: 6,
    ids: { footballData: "FL1", theSportsDb: "4334", apiFootball: 61 },
  },
  {
    code: "npfl",
    sport: "football",
    name: "Nigeria Professional Football League",
    shortName: "NPFL",
    country: "Nigeria",
    flag: "🇳🇬",
    rank: 7,
    // 4855 was KOPW, a Chinese competition dormant since 2022, so every NPFL
    // fetch resolved to nothing and the flagship home-market league could
    // never publish a pick. 4827 is "Nigerian NPFL". Verified by lookup, not
    // assumed: TheSportsDB ids are opaque integers and a wrong one fails
    // silently as an empty result rather than an error.
    ids: { theSportsDb: "4827", apiFootball: 399 },
  },
  {
    code: "championship",
    sport: "football",
    name: "English Championship",
    shortName: "Championship",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rank: 8,
    ids: { footballData: "ELC", theSportsDb: "4329", apiFootball: 40 },
  },
  {
    code: "eredivisie",
    sport: "football",
    name: "Dutch Eredivisie",
    shortName: "Eredivisie",
    country: "Netherlands",
    flag: "🇳🇱",
    rank: 9,
    ids: { footballData: "DED", theSportsDb: "4337", apiFootball: 88 },
  },
  {
    code: "primeira-liga",
    sport: "football",
    name: "Portuguese Primeira Liga",
    shortName: "Primeira Liga",
    country: "Portugal",
    flag: "🇵🇹",
    rank: 10,
    ids: { footballData: "PPL", theSportsDb: "4344", apiFootball: 94 },
  },
  {
    code: "caf-champions-league",
    sport: "football",
    name: "CAF Champions League",
    shortName: "CAF CL",
    country: "Africa",
    flag: "🌍",
    rank: 11,
    // No theSportsDb id: 4552 resolves to "AAF", a defunct United States
    // American-football league, which would have filed its fixtures under CAF
    // Champions League. Omitting the id is strictly better than a wrong one —
    // the adapter skips the competition instead of mislabelling another sport.
    ids: { apiFootball: 12 },
  },
  {
    code: "brasileirao",
    sport: "football",
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

/**
 * Provider display names that mean a catalogued competition.
 *
 * Every adapter prefers the feed's own name for a competition over ours, so
 * one league arrives under three spellings depending on which provider
 * answered. Fixtures carry `league.code` alongside and are unaffected; this
 * exists for the stored rows written before that code was recorded, and as the
 * last resort when a feed returns a competition with no id we recognise.
 *
 * Matching is EXACT on the normalised key, never a substring, and that is the
 * whole point. The log holds "Primera Division" (football-data's name for La
 * Liga) next to "Argentinian Primera Division" and "Chile Primera Division" --
 * a substring or fuzzy match folds three different competitions into Spain.
 */
const PROVIDER_ALIASES: Record<string, string> = {
  "premier-league": "Premier League | English Premier League | EPL",
  championship: "Championship | English Championship | English League Championship",
  "la-liga": "La Liga | LaLiga | Primera Division | Spanish La Liga | Spain Primera Division",
  "serie-a": "Serie A | Italian Serie A | Italy Serie A",
  bundesliga: "Bundesliga | German Bundesliga | 1. Bundesliga",
  "ligue-1": "Ligue 1 | French Ligue 1 | Ligue 1 Uber Eats",
  eredivisie: "Eredivisie | Dutch Eredivisie",
  "primeira-liga": "Primeira Liga | Portuguese Primeira Liga | Liga Portugal | Liga Portugal Betclic",
  brasileirao:
    "Campeonato Brasileiro Série A | Brazilian Serie A | Brasileirão Série A | Brasileiro Serie A",
  "champions-league": "UEFA Champions League | Champions League",
  "caf-champions-league": "CAF Champions League | CAF Champions League Group Stage",
  npfl: "Nigeria Professional Football League | Nigerian Premier League | NPFL | Nigerian Professional Football League",
};

/**
 * Competition names collapse across feeds by accent, punctuation and case, but
 * never by dropping words -- "Primera Division" and "Argentinian Primera
 * Division" must stay distinct keys.
 */
function normaliseLeagueName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const BY_PROVIDER_NAME = new Map<string, LeagueDef>();
for (const [code, aliases] of Object.entries(PROVIDER_ALIASES)) {
  const def = BY_CODE.get(code);
  if (!def) continue;
  for (const alias of [def.name, def.shortName, ...aliases.split("|")]) {
    BY_PROVIDER_NAME.set(normaliseLeagueName(alias.trim()), def);
  }
}

/**
 * Resolve a provider's competition name to a catalogued league.
 *
 * Returns undefined for anything outside the catalogue -- which is most of
 * what the feeds carry, and is a fact about the fixture rather than a failure.
 */
export function leagueByProviderName(name: string | null | undefined): LeagueDef | undefined {
  if (!name) return undefined;
  return BY_PROVIDER_NAME.get(normaliseLeagueName(name));
}
