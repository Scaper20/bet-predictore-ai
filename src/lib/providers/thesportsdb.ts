/**
 * TheSportsDB adapter.
 *
 * This is the zero-config feed: the public test key "123" works without any
 * signup, which means a fresh clone of this repo shows real fixtures and real
 * live scores immediately. The trade-off is that the test key truncates most
 * list endpoints to a handful of rows, so a paid key (THESPORTSDB_API_KEY)
 * lifts coverage substantially. Live scores are the one endpoint that is not
 * truncated, which is why this adapter stays useful even unpaid.
 */

import type { Match, MatchStatus, ResultRow, StandingRow, Team } from "@/lib/types";
import { sportOrDefault } from "@/lib/sports";
import { LEAGUES, leagueByProviderId, type LeagueDef } from "@/lib/leagues";
import { getJson } from "./http";
import { cached } from "./cache";

const KEY = process.env.THESPORTSDB_API_KEY?.trim() || "123";
/** What TheSportsDB calls this sport in its `s=` filter. */
const SPORT = sportOrDefault().providers.theSportsDb ?? "Soccer";

const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

/** True when running on the shared public key, which is heavily truncated. */
export const isFreeTierKey = KEY === "123";

interface SdbEvent {
  idEvent: string;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strEvent?: string | null;
  strSport?: string | null;
  idLeague?: string | null;
  strLeague?: string | null;
  strLeagueBadge?: string | null;
  strSeason?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string | null;
  strProgress?: string | null;
  strVenue?: string | null;
  intRound?: string | null;
  strCountry?: string | null;
}

interface SdbLive {
  idEvent: string;
  strSport?: string | null;
  idLeague?: string | null;
  strLeague?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string | null;
  strProgress?: string | null;
  strEventTime?: string | null;
  strTimestamp?: string | null;
}

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shortName(name: string): string {
  return name
    .replace(/\b(FC|AFC|CF|SC|AC|BK|SK|United|City)\b/g, (m) =>
      m === "United" ? "Utd" : m === "City" ? "City" : "",
    )
    .replace(/\s+/g, " ")
    .trim() || name;
}

function team(id: string | null | undefined, name: string | null | undefined, crest?: string | null): Team {
  const n = name?.trim() || "Unknown";
  return {
    id: id?.trim() || `name:${n.toLowerCase().replace(/\s+/g, "-")}`,
    name: n,
    shortName: shortName(n),
    crest: crest || undefined,
  };
}

/**
 * TheSportsDB reports status through a mix of `strStatus` ("Match Finished",
 * "1H", "FT", "NS") and `strProgress` (the clock). Map both onto our enum.
 */
function mapStatus(raw: string | null | undefined, kickoff: number): MatchStatus {
  const s = (raw || "").trim().toUpperCase();
  if (["FT", "AET", "PEN", "MATCH FINISHED", "FINISHED"].includes(s)) return "finished";
  if (["HT", "HALF TIME", "HALFTIME"].includes(s)) return "halftime";
  if (["1H", "2H", "ET", "LIVE", "IN PLAY", "PLAYING"].includes(s)) return "live";
  if (["PST", "POSTP", "POSTPONED"].includes(s)) return "postponed";
  if (["CANC", "CANCELLED", "ABD", "ABANDONED"].includes(s)) return "cancelled";
  if (s === "NS" || s === "NOT STARTED" || s === "") {
    // Some rows carry no status at all; fall back to the clock.
    return Date.now() > kickoff + 3 * 60 * 60 * 1000 ? "finished" : "scheduled";
  }
  // Numeric progress like "67" means the game is running.
  if (/^\d+\+?$/.test(s)) return "live";
  return "scheduled";
}

function kickoffMs(e: { strTimestamp?: string | null; dateEvent?: string | null; strTime?: string | null }): number {
  if (e.strTimestamp) {
    // Feed emits "2026-08-21 19:00:00" or ISO; both are UTC.
    const iso = e.strTimestamp.includes("T") ? e.strTimestamp : e.strTimestamp.replace(" ", "T");
    const ms = Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`);
    if (Number.isFinite(ms)) return ms;
  }
  if (e.dateEvent) {
    const t = (e.strTime || "00:00:00").slice(0, 8);
    const ms = Date.parse(`${e.dateEvent}T${t}Z`);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

function toMatch(e: SdbEvent): Match | null {
  if (!e.strHomeTeam || !e.strAwayTeam) return null;
  const ms = kickoffMs(e);
  const def = leagueByProviderId("theSportsDb", e.idLeague);
  const minute = num(e.strProgress ?? null);

  return {
    id: `sdb:${e.idEvent}`,
    kickoff: new Date(ms).toISOString(),
    status: mapStatus(e.strStatus ?? e.strProgress, ms),
    minute,
    league: {
      id: e.idLeague || "0",
      name: e.strLeague || def?.name || "Football",
      country: e.strCountry || def?.country,
      logo: e.strLeagueBadge || undefined,
      code: def?.code,
    },
    home: team(e.idHomeTeam, e.strHomeTeam, e.strHomeTeamBadge),
    away: team(e.idAwayTeam, e.strAwayTeam, e.strAwayTeamBadge),
    score: { home: num(e.intHomeScore ?? null), away: num(e.intAwayScore ?? null) },
    venue: e.strVenue || null,
    round: e.intRound ? `Round ${e.intRound}` : null,
    source: "thesportsdb",
  };
}

function liveToMatch(e: SdbLive): Match | null {
  if (!e.strHomeTeam || !e.strAwayTeam) return null;
  if (e.strSport && e.strSport !== SPORT) return null;
  const def = leagueByProviderId("theSportsDb", e.idLeague);
  const ms = e.strTimestamp ? kickoffMs({ strTimestamp: e.strTimestamp }) : Date.now();

  return {
    id: `sdb:${e.idEvent}`,
    kickoff: new Date(ms).toISOString(),
    status: mapStatus(e.strStatus ?? e.strProgress, ms),
    minute: num(e.strProgress ?? null),
    league: {
      id: e.idLeague || "0",
      name: e.strLeague || def?.name || "Football",
      country: def?.country,
      code: def?.code,
    },
    home: team(e.idHomeTeam, e.strHomeTeam, e.strHomeTeamBadge),
    away: team(e.idAwayTeam, e.strAwayTeam, e.strAwayTeamBadge),
    score: { home: num(e.intHomeScore ?? null), away: num(e.intAwayScore ?? null) },
    source: "thesportsdb",
  };
}

/** Live soccer scores across every competition the feed tracks. */
export async function fetchLive(): Promise<Match[]> {
  return cached("sdb:live", 20_000, async () => {
    const data = await getJson<{ livescore?: SdbLive[] | null }>(
      `${BASE}/livescore.php?s=${encodeURIComponent(SPORT)}`,
      { provider: "thesportsdb" },
    );
    return (data.livescore ?? []).map(liveToMatch).filter((m): m is Match => m !== null);
  });
}

/** Every soccer fixture on a given calendar day (YYYY-MM-DD, UTC). */
export async function fetchByDate(date: string): Promise<Match[]> {
  return cached(`sdb:day:${date}`, 5 * 60_000, async () => {
    const data = await getJson<{ events?: SdbEvent[] | null }>(
      `${BASE}/eventsday.php?d=${encodeURIComponent(date)}&s=${encodeURIComponent(SPORT)}`,
      { provider: "thesportsdb" },
    );
    return (data.events ?? []).map(toMatch).filter((m): m is Match => m !== null);
  });
}

/** Upcoming fixtures for one league. */
export async function fetchLeagueUpcoming(league: LeagueDef): Promise<Match[]> {
  const id = league.ids.theSportsDb;
  if (!id) return [];
  return cached(`sdb:next:${id}`, 10 * 60_000, async () => {
    const data = await getJson<{ events?: SdbEvent[] | null }>(
      `${BASE}/eventsnextleague.php?id=${id}`,
      { provider: "thesportsdb" },
    );
    return (data.events ?? []).map(toMatch).filter((m): m is Match => m !== null);
  });
}

/**
 * Completed matches for a league season — the training set for the model.
 *
 * `eventsseason.php` returns the full fixture list including played games,
 * and is not truncated as aggressively as the "next/past" endpoints.
 */
export async function fetchSeasonResults(league: LeagueDef, season?: string): Promise<ResultRow[]> {
  const id = league.ids.theSportsDb;
  if (!id) return [];
  const s = season ?? currentSeasonLabel();
  return cached(`sdb:season:${id}:${s}`, 30 * 60_000, async () => {
    const data = await getJson<{ events?: SdbEvent[] | null }>(
      `${BASE}/eventsseason.php?id=${id}&s=${encodeURIComponent(s)}`,
      { provider: "thesportsdb" },
    );
    return (data.events ?? [])
      .map((e): ResultRow | null => {
        const hg = num(e.intHomeScore ?? null);
        const ag = num(e.intAwayScore ?? null);
        if (hg === null || ag === null || !e.strHomeTeam || !e.strAwayTeam) return null;
        return {
          homeId: e.idHomeTeam || e.strHomeTeam,
          awayId: e.idAwayTeam || e.strAwayTeam,
          homeName: e.strHomeTeam,
          awayName: e.strAwayTeam,
          homeGoals: hg,
          awayGoals: ag,
          date: kickoffMs(e),
          leagueId: e.idLeague || id,
        };
      })
      .filter((r): r is ResultRow => r !== null);
  });
}

/**
 * Completed matches for any league id the feed knows, catalogued or not.
 *
 * Fixtures arrive from the live/day endpoints tagged with their own league id,
 * including leagues outside our curated list. Fitting those against a
 * catalogued league's ratings would be wrong, so predictions for them are
 * trained on their own competition via this path.
 */
export async function fetchSeasonResultsByLeagueId(
  leagueId: string,
  season?: string,
): Promise<ResultRow[]> {
  if (!leagueId || leagueId === "0") return [];
  const s = season ?? currentSeasonLabel();
  return cached(`sdb:season-raw:${leagueId}:${s}`, 30 * 60_000, async () => {
    try {
      const data = await getJson<{ events?: SdbEvent[] | null }>(
        `${BASE}/eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(s)}`,
        { provider: "thesportsdb" },
      );
      return (data.events ?? [])
        .map((e): ResultRow | null => {
          const hg = num(e.intHomeScore ?? null);
          const ag = num(e.intAwayScore ?? null);
          if (hg === null || ag === null || !e.strHomeTeam || !e.strAwayTeam) return null;
          return {
            homeId: e.idHomeTeam || e.strHomeTeam,
            awayId: e.idAwayTeam || e.strAwayTeam,
            homeName: e.strHomeTeam,
            awayName: e.strAwayTeam,
            homeGoals: hg,
            awayGoals: ag,
            date: kickoffMs(e),
            leagueId: e.idLeague || leagueId,
          };
        })
        .filter((r): r is ResultRow => r !== null);
    } catch {
      return [];
    }
  });
}

export async function fetchStandings(league: LeagueDef, season?: string): Promise<StandingRow[]> {
  const id = league.ids.theSportsDb;
  if (!id) return [];
  const s = season ?? currentSeasonLabel();
  return cached(`sdb:table:${id}:${s}`, 30 * 60_000, async () => {
    interface Row {
      intRank?: string; idTeam?: string; strTeam?: string; strBadge?: string;
      intPlayed?: string; intWin?: string; intDraw?: string; intLoss?: string;
      intGoalsFor?: string; intGoalsAgainst?: string; intGoalDifference?: string; intPoints?: string;
    }
    const data = await getJson<{ table?: Row[] | null }>(
      `${BASE}/lookuptable.php?l=${id}&s=${encodeURIComponent(s)}`,
      { provider: "thesportsdb" },
    );
    return (data.table ?? []).map((r, i): StandingRow => ({
      position: num(r.intRank ?? null) ?? i + 1,
      team: team(r.idTeam, r.strTeam, r.strBadge),
      played: num(r.intPlayed ?? null) ?? 0,
      won: num(r.intWin ?? null) ?? 0,
      drawn: num(r.intDraw ?? null) ?? 0,
      lost: num(r.intLoss ?? null) ?? 0,
      goalsFor: num(r.intGoalsFor ?? null) ?? 0,
      goalsAgainst: num(r.intGoalsAgainst ?? null) ?? 0,
      goalDifference: num(r.intGoalDifference ?? null) ?? 0,
      points: num(r.intPoints ?? null) ?? 0,
    }));
  });
}

export async function fetchMatch(rawId: string): Promise<Match | null> {
  const id = rawId.replace(/^sdb:/, "");
  return cached(`sdb:event:${id}`, 30_000, async () => {
    try {
      const data = await getJson<{ events?: SdbEvent[] | null }>(
        `${BASE}/lookupevent.php?id=${encodeURIComponent(id)}`,
        { provider: "thesportsdb" },
      );
      const first = data.events?.[0];
      return first ? toMatch(first) : null;
    } catch {
      // The shared public test key rate-limits hard under real traffic — a
      // failure here must not 404 a fixture the user just saw rendered in a
      // list. getMatch() in providers/index.ts falls back to the already
      // cached, multi-provider live/upcoming feeds when this comes back null.
      return null;
    }
  });
}

/** Head-to-head history between two clubs, newest first. */
export async function fetchH2H(homeName: string, awayName: string): Promise<ResultRow[]> {
  const key = `sdb:h2h:${homeName}|${awayName}`.toLowerCase();
  return cached(key, 60 * 60_000, async () => {
    const url =
      `${BASE}/searchevents.php?e=${encodeURIComponent(`${homeName}_vs_${awayName}`)}`;
    try {
      const data = await getJson<{ event?: SdbEvent[] | null }>(url, { provider: "thesportsdb" });
      return (data.event ?? [])
        .map((e): ResultRow | null => {
          const hg = num(e.intHomeScore ?? null);
          const ag = num(e.intAwayScore ?? null);
          if (hg === null || ag === null || !e.strHomeTeam || !e.strAwayTeam) return null;
          return {
            homeId: e.idHomeTeam || e.strHomeTeam,
            awayId: e.idAwayTeam || e.strAwayTeam,
            homeName: e.strHomeTeam,
            awayName: e.strAwayTeam,
            homeGoals: hg,
            awayGoals: ag,
            date: kickoffMs(e),
            leagueId: e.idLeague || "0",
          };
        })
        .filter((r): r is ResultRow => r !== null)
        .sort((a, b) => b.date - a.date);
    } catch {
      // H2H search is best-effort; absence must not fail a match page.
      return [];
    }
  });
}

/** Season labels look like "2026-2027" for European calendars. */
export function currentSeasonLabel(now = new Date()): string {
  const y = now.getUTCFullYear();
  // European seasons roll over at the start of July.
  return now.getUTCMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Walk backwards from the current season: ["2026-2027", "2025-2026", ...]. */
export function seasonLabels(count: number, now = new Date()): string[] {
  const start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return Array.from({ length: count }, (_, i) => `${start - i}-${start - i + 1}`);
}

/**
 * Season labels in both conventions the feed uses.
 *
 * European leagues straddle two calendar years and are keyed "2026-2027";
 * South and North American leagues run inside one year and are keyed "2026".
 * Which applies is a property of the competition, not something the fixture
 * payload tells us, so both are tried per year and the empty one costs
 * nothing but a cached miss.
 */
export function seasonCandidates(years: number, now = new Date()): string[] {
  const split = seasonLabels(years, now);
  const calendarStart = now.getUTCFullYear();
  const out: string[] = [];
  for (let i = 0; i < years; i++) {
    out.push(split[i], String(calendarStart - i));
  }
  return out;
}

export const leaguesWithSdbIds = (): LeagueDef[] =>
  LEAGUES.filter((l) => Boolean(l.ids.theSportsDb));
