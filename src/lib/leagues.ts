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
  /**
   * Set only on national-team competitions. National sides play a handful of
   * games a year spread across qualifiers, tournaments and friendlies, so one
   * competition's history is far too thin to rate them; training pools every
   * competition in the same confederation plus the global ones (World Cup,
   * friendlies) — see internationalPool().
   */
  confederation?: "CAF" | "UEFA" | "CONMEBOL" | "CONCACAF" | "global";
  /**
   * Finals tournaments played at neutral venues: no home advantage is applied.
   * Qualifiers are home-and-away and must NOT carry this.
   */
  neutralVenue?: boolean;
  ids: {
    /** football-data.org competition code. */
    footballData?: string;
    /** TheSportsDB numeric league id. */
    theSportsDb?: string;
    /** API-Football numeric league id. */
    apiFootball?: number;
    /**
     * SportyBet tournament id, a Betradar `sr:tournament:N`.
     *
     * Without it a price lookup falls back to scanning SportyBet’s general
     * board, which is ordered by competition and 2,093 events long — the
     * Brasileirao sits far enough back that the scan found nothing. With it,
     * one call returns that competition’s whole fixture list.
     *
     * Read off the live board, never guessed: a wrong id here quietly means
     * no price rather than a wrong one, but it also means the feature is off
     * for that competition and nobody would notice.
     */
    sportyBet?: string;
  };
  /**
   * Where a COMPLETE season history comes from.
   *
   * Deliberately separate from `ids`. Those address live feeds — fixtures and
   * scores, the things that change. These address season archives, which are
   * finished and never change, and which the model needs far more of than any
   * free live tier will serve: measured through the production path every
   * competition was training on 15-35 matches, and the backtest puts that at
   * 51.6% accuracy against 66.3% on full history.
   */
  archive?: {
    /** football-data.co.uk division code, one file per season. Free, no key. */
    footballDataUk?: string;
    /** football-data.co.uk per-country file, which holds many seasons at once. */
    footballDataUkCountry?: { file: string; league: string };
    /**
     * Sofascore uniqueTournament id, reached through SportAPI7.
     *
     * Reserved for competitions no free archive carries. Its free tier allows
     * fifty requests a month and one season costs thirteen pages, so this is
     * set only where football-data.co.uk cannot reach — which is precisely the
     * African and continental competitions that differentiate this product.
     */
    sportApi?: number;
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
    ids: { footballData: "PL", theSportsDb: "4328", apiFootball: 39, sportyBet: "sr:tournament:17" },
    archive: { footballDataUk: "E0" },
  },
  {
    code: "champions-league",
    sport: "football",
    name: "UEFA Champions League",
    shortName: "UCL",
    country: "Europe",
    flag: "🇪🇺",
    rank: 2,
    ids: { footballData: "CL", theSportsDb: "4480", apiFootball: 2, sportyBet: "sr:tournament:7" },
    archive: { sportApi: 7 },
  },
  {
    code: "la-liga",
    sport: "football",
    name: "Spanish La Liga",
    shortName: "La Liga",
    country: "Spain",
    flag: "🇪🇸",
    rank: 6,
    ids: { footballData: "PD", theSportsDb: "4335", apiFootball: 140, sportyBet: "sr:tournament:8" },
    archive: { footballDataUk: "SP1" },
  },
  {
    code: "serie-a",
    sport: "football",
    name: "Italian Serie A",
    shortName: "Serie A",
    country: "Italy",
    flag: "🇮🇹",
    rank: 7,
    ids: { footballData: "SA", theSportsDb: "4332", apiFootball: 135, sportyBet: "sr:tournament:23" },
    archive: { footballDataUk: "I1" },
  },
  {
    code: "bundesliga",
    sport: "football",
    name: "German Bundesliga",
    shortName: "Bundesliga",
    country: "Germany",
    flag: "🇩🇪",
    rank: 8,
    ids: { footballData: "BL1", theSportsDb: "4331", apiFootball: 78, sportyBet: "sr:tournament:35" },
    archive: { footballDataUk: "D1" },
  },
  {
    code: "ligue-1",
    sport: "football",
    name: "French Ligue 1",
    shortName: "Ligue 1",
    country: "France",
    flag: "🇫🇷",
    rank: 9,
    ids: { footballData: "FL1", theSportsDb: "4334", apiFootball: 61, sportyBet: "sr:tournament:34" },
    archive: { footballDataUk: "F1" },
  },
  {
    code: "npfl",
    sport: "football",
    name: "Nigeria Professional Football League",
    shortName: "NPFL",
    country: "Nigeria",
    flag: "🇳🇬",
    rank: 10,
    // 4855 was KOPW, a Chinese competition dormant since 2022, so every NPFL
    // fetch resolved to nothing and the flagship home-market league could
    // never publish a pick. 4827 is "Nigerian NPFL". Verified by lookup, not
    // assumed: TheSportsDB ids are opaque integers and a wrong one fails
    // silently as an empty result rather than an error.
    ids: { theSportsDb: "4827", apiFootball: 399, sportyBet: "sr:tournament:2112" },
    archive: { sportApi: 2060 },
  },
  {
    code: "championship",
    sport: "football",
    name: "English Championship",
    shortName: "Championship",
    country: "England",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    rank: 12,
    ids: { footballData: "ELC", theSportsDb: "4329", apiFootball: 40, sportyBet: "sr:tournament:18" },
    archive: { footballDataUk: "E1" },
  },
  {
    code: "eredivisie",
    sport: "football",
    name: "Dutch Eredivisie",
    shortName: "Eredivisie",
    country: "Netherlands",
    flag: "🇳🇱",
    rank: 13,
    ids: { footballData: "DED", theSportsDb: "4337", apiFootball: 88, sportyBet: "sr:tournament:37" },
    archive: { footballDataUk: "N1" },
  },
  {
    code: "primeira-liga",
    sport: "football",
    name: "Portuguese Primeira Liga",
    shortName: "Primeira Liga",
    country: "Portugal",
    flag: "🇵🇹",
    rank: 14,
    ids: { footballData: "PPL", theSportsDb: "4344", apiFootball: 94 },
    archive: { footballDataUk: "P1" },
  },
  {
    code: "caf-champions-league",
    sport: "football",
    name: "CAF Champions League",
    shortName: "CAF CL",
    country: "Africa",
    flag: "🌍",
    rank: 15,
    // 4720, checked against lookupleague.php: "CAF Champions League", soccer,
    // seasons keyed "2026-2027". (An earlier guess, 4552, was a defunct
    // American-football league; never add an id here without looking it up.)
    ids: { theSportsDb: "4720", apiFootball: 12, sportyBet: "sr:tournament:1054" },
    archive: { sportApi: 1054 },
  },
  {
    code: "brasileirao",
    sport: "football",
    name: "Brazilian Série A",
    shortName: "Brasileirão",
    country: "Brazil",
    flag: "🇧🇷",
    rank: 16,
    ids: { footballData: "BSA", theSportsDb: "4351", apiFootball: 71, sportyBet: "sr:tournament:325" },
    archive: { footballDataUkCountry: { file: "BRA", league: "Serie A" } },
  },

  /*
   * National-team competitions.
   *
   * TheSportsDB ids were read off each national side's own team record
   * (searchteams.php — Nigeria, England, Brazil, USA and others list the
   * competitions they play in), not recalled. football-data codes are only
   * set for WC and EC, the two on its free tier; the qualifiers and AFCON
   * exist there but are paid-tier, and asking a free key for them is a
   * guaranteed 403 that still burns the 10/min rate limit. API-Football ids
   * are deliberately absent until confirmed against a live key, same rule
   * as the CAF Champions League entry above.
   */
  {
    code: "afcon",
    sport: "football",
    name: "Africa Cup of Nations",
    shortName: "AFCON",
    country: "Africa",
    flag: "🌍",
    rank: 3,
    confederation: "CAF",
    neutralVenue: true,
    ids: { theSportsDb: "4496" },
  },
  {
    code: "wcq-caf",
    sport: "football",
    name: "World Cup Qualifying CAF",
    shortName: "WCQ Africa",
    country: "Africa",
    flag: "🌍",
    rank: 4,
    confederation: "CAF",
    ids: { theSportsDb: "5514" },
  },
  {
    code: "world-cup",
    sport: "football",
    name: "FIFA World Cup",
    shortName: "World Cup",
    country: "World",
    flag: "🏆",
    rank: 5,
    confederation: "global",
    neutralVenue: true,
    ids: { footballData: "WC", theSportsDb: "4429" },
  },
  {
    code: "afcon-qualifiers",
    sport: "football",
    name: "Africa Cup of Nations Qualifying",
    shortName: "AFCON Qualifiers",
    country: "Africa",
    flag: "🌍",
    rank: 11,
    confederation: "CAF",
    ids: { theSportsDb: "5520" },
  },
  {
    code: "euro",
    sport: "football",
    name: "UEFA European Championship",
    shortName: "Euro",
    country: "Europe",
    flag: "🇪🇺",
    rank: 17,
    confederation: "UEFA",
    neutralVenue: true,
    ids: { footballData: "EC", theSportsDb: "4502" },
  },
  {
    code: "nations-league",
    sport: "football",
    name: "UEFA Nations League",
    shortName: "Nations League",
    country: "Europe",
    flag: "🇪🇺",
    rank: 18,
    confederation: "UEFA",
    ids: { theSportsDb: "4490" },
  },
  {
    code: "wcq-uefa",
    sport: "football",
    name: "World Cup Qualifying UEFA",
    shortName: "WCQ Europe",
    country: "Europe",
    flag: "🇪🇺",
    rank: 19,
    confederation: "UEFA",
    ids: { theSportsDb: "5518" },
  },
  {
    code: "copa-america",
    sport: "football",
    name: "Copa America",
    shortName: "Copa América",
    country: "South America",
    flag: "🌎",
    rank: 20,
    confederation: "CONMEBOL",
    neutralVenue: true,
    ids: { theSportsDb: "4499" },
  },
  {
    code: "wcq-conmebol",
    sport: "football",
    name: "World Cup Qualifying CONMEBOL",
    shortName: "WCQ S. America",
    country: "South America",
    flag: "🌎",
    rank: 21,
    confederation: "CONMEBOL",
    ids: { theSportsDb: "5515" },
  },
  {
    code: "euro-qualifiers",
    sport: "football",
    name: "UEFA European Championship Qualifying",
    shortName: "Euro Qualifiers",
    country: "Europe",
    flag: "🇪🇺",
    rank: 22,
    confederation: "UEFA",
    ids: { theSportsDb: "5519" },
  },
  {
    code: "international-friendlies",
    sport: "football",
    name: "International Friendlies",
    shortName: "Friendlies",
    country: "World",
    flag: "🤝",
    rank: 23,
    confederation: "global",
    ids: { theSportsDb: "4562" },
  },
  {
    code: "gold-cup",
    sport: "football",
    name: "CONCACAF Gold Cup",
    shortName: "Gold Cup",
    country: "North America",
    flag: "🌎",
    rank: 24,
    confederation: "CONCACAF",
    neutralVenue: true,
    ids: { theSportsDb: "4873" },
  },
  {
    code: "wcq-concacaf",
    sport: "football",
    name: "World Cup Qualifying CONCACAF",
    shortName: "WCQ CONCACAF",
    country: "North America",
    flag: "🌎",
    rank: 25,
    confederation: "CONCACAF",
    ids: { theSportsDb: "5516" },
  },
];

/** Club competitions, catalogue order. */
export const CLUB_LEAGUES = LEAGUES.filter((l) => !l.confederation);
/** National-team competitions, catalogue order. */
export const INTERNATIONAL_LEAGUES = LEAGUES.filter((l) => Boolean(l.confederation));

/**
 * Every competition whose results should train a national-team fixture in
 * `league`: the same confederation plus the global ones. A CAF qualifier
 * pools AFCON, AFCON qualifiers, other CAF qualifiers, the World Cup and
 * friendlies — enough games per side to actually rate them. Empty for club
 * competitions, which train on their own history.
 */
export function internationalPool(league: LeagueDef): LeagueDef[] {
  if (!league.confederation) return [];
  return INTERNATIONAL_LEAGUES.filter(
    (l) => l.confederation === league.confederation || l.confederation === "global" || league.confederation === "global",
  );
}

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
  // Spellings as each feed returns them: TheSportsDB names (from the team
  // records the ids were read off) and football-data's competition list.
  afcon: "African Cup of Nations | Africa Cup Of Nations | AFCON",
  "afcon-qualifiers": "African Cup of Nations Qualifying | Africa Cup Of Nations - Qualification",
  "wcq-caf": "WC Qualification CAF | World Cup Qualification Africa",
  "world-cup": "World Cup",
  euro: "UEFA European Championships | European Championship | Euro",
  "euro-qualifiers": "UEFA European Championships Qualifying | European Championship Qualifiers",
  "nations-league": "UEFA Nations League",
  "wcq-uefa": "WC Qualification UEFA | World Cup Qualification Europe",
  "copa-america": "Copa América | CONMEBOL Copa America",
  "wcq-conmebol": "WC Qualification CONMEBOL | World Cup Qualification South America",
  "international-friendlies": "International Friendlies | Friendlies",
  "gold-cup": "CONCACAF Gold Cup | Gold Cup",
  "wcq-concacaf": "WC Qualification CONCACAF | World Cup Qualification CONCACAF",
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
