/**
 * football-data.org adapter — the recommended production feed.
 *
 * The free tier covers the twelve competitions that matter most to this
 * audience (EPL, UCL, the rest of the European top five, Championship,
 * Eredivisie, Primeira Liga, Brasileirão) at 10 requests/minute with no result
 * truncation, which is why it outranks TheSportsDB when a key is present.
 * Set FOOTBALL_DATA_API_KEY to enable it.
 */

import type { Match, MatchStatus, ResultRow, StandingRow, Team } from "@/lib/types";
import { LEAGUES, leagueByProviderId, type LeagueDef } from "@/lib/leagues";
import { getJson } from "./http";
import { cached } from "./cache";

const BASE = "https://api.football-data.org/v4";

export const apiKey = (): string | undefined =>
  process.env.FOOTBALL_DATA_API_KEY?.trim() || undefined;

export const isConfigured = (): boolean => Boolean(apiKey());

function headers(): Record<string, string> {
  const k = apiKey();
  return k ? { "X-Auth-Token": k } : {};
}

interface FdTeam {
  id?: number | null;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string | null;
  minute?: number | string | null;
  competition?: { id?: number; name?: string; code?: string; emblem?: string } | null;
  area?: { name?: string } | null;
  homeTeam?: FdTeam | null;
  awayTeam?: FdTeam | null;
  score?: {
    fullTime?: { home?: number | null; away?: number | null } | null;
    halfTime?: { home?: number | null; away?: number | null } | null;
  } | null;
}

function team(t: FdTeam | null | undefined): Team {
  const name = t?.name?.trim() || "Unknown";
  return {
    id: t?.id != null ? String(t.id) : `name:${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    shortName: t?.shortName?.trim() || t?.tla?.trim() || name,
    crest: t?.crest || undefined,
  };
}

function mapStatus(s: string): MatchStatus {
  switch (s) {
    case "IN_PLAY":
      return "live";
    case "PAUSED":
      return "halftime";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
    case "SUSPENDED":
      return "cancelled";
    default:
      return "scheduled"; // SCHEDULED, TIMED
  }
}

function toMatch(m: FdMatch): Match {
  const def =
    leagueByProviderId("footballData", m.competition?.code) ??
    LEAGUES.find((l) => l.ids.footballData === m.competition?.code);
  const minute =
    typeof m.minute === "number"
      ? m.minute
      : typeof m.minute === "string"
        ? Number.parseInt(m.minute, 10) || null
        : null;

  return {
    id: `fd:${m.id}`,
    kickoff: m.utcDate,
    status: mapStatus(m.status),
    minute,
    league: {
      id: m.competition?.code || String(m.competition?.id ?? "0"),
      name: m.competition?.name || def?.name || "Football",
      country: m.area?.name || def?.country,
      logo: m.competition?.emblem,
      code: def?.code,
    },
    home: team(m.homeTeam),
    away: team(m.awayTeam),
    score: {
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
    },
    halftime: m.score?.halfTime
      ? { home: m.score.halfTime.home ?? null, away: m.score.halfTime.away ?? null }
      : undefined,
    round: m.matchday ? `Matchday ${m.matchday}` : m.stage || null,
    source: "football-data",
  };
}

/** Matches across all subscribed competitions in a UTC date window. */
export async function fetchRange(dateFrom: string, dateTo: string): Promise<Match[]> {
  if (!isConfigured()) return [];
  return cached(`fd:range:${dateFrom}:${dateTo}`, 3 * 60_000, async () => {
    const data = await getJson<{ matches?: FdMatch[] | null }>(
      `${BASE}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      { headers: headers(), provider: "football-data" },
    );
    return (data.matches ?? []).map(toMatch);
  });
}

export async function fetchLive(): Promise<Match[]> {
  if (!isConfigured()) return [];
  return cached("fd:live", 20_000, async () => {
    const data = await getJson<{ matches?: FdMatch[] | null }>(
      `${BASE}/matches?status=LIVE`,
      { headers: headers(), provider: "football-data" },
    );
    return (data.matches ?? []).map(toMatch);
  });
}

export async function fetchByDate(date: string): Promise<Match[]> {
  return fetchRange(date, date);
}

export async function fetchLeagueUpcoming(league: LeagueDef): Promise<Match[]> {
  const code = league.ids.footballData;
  if (!isConfigured() || !code) return [];
  return cached(`fd:next:${code}`, 10 * 60_000, async () => {
    const data = await getJson<{ matches?: FdMatch[] | null }>(
      `${BASE}/competitions/${code}/matches?status=SCHEDULED`,
      { headers: headers(), provider: "football-data" },
    );
    return (data.matches ?? []).map(toMatch);
  });
}

/**
 * Finished matches for a season — model training data.
 *
 * `season` is the starting year (2025 means the 2025/26 campaign). Omitting it
 * gives the current season, which is empty in the opening weeks; callers walk
 * backwards through seasons to reach a usable sample size.
 */
export async function fetchSeasonResults(
  league: LeagueDef,
  season?: number,
): Promise<ResultRow[]> {
  const code = league.ids.footballData;
  if (!isConfigured() || !code) return [];
  const q = season ? `&season=${season}` : "";
  return cached(`fd:results:${code}:${season ?? "current"}`, 30 * 60_000, async () => {
    const data = await getJson<{ matches?: FdMatch[] | null }>(
      `${BASE}/competitions/${code}/matches?status=FINISHED${q}`,
      { headers: headers(), provider: "football-data" },
    );
    return (data.matches ?? [])
      .map((m): ResultRow | null => {
        const hg = m.score?.fullTime?.home;
        const ag = m.score?.fullTime?.away;
        if (hg == null || ag == null) return null;
        const h = team(m.homeTeam);
        const a = team(m.awayTeam);
        return {
          homeId: h.id,
          awayId: a.id,
          homeName: h.name,
          awayName: a.name,
          homeGoals: hg,
          awayGoals: ag,
          date: Date.parse(m.utcDate),
          leagueId: code,
        };
      })
      .filter((r): r is ResultRow => r !== null);
  });
}

export async function fetchStandings(league: LeagueDef): Promise<StandingRow[]> {
  const code = league.ids.footballData;
  if (!isConfigured() || !code) return [];
  return cached(`fd:table:${code}`, 30 * 60_000, async () => {
    interface Row {
      position?: number; team?: FdTeam; playedGames?: number; won?: number;
      draw?: number; lost?: number; goalsFor?: number; goalsAgainst?: number;
      goalDifference?: number; points?: number;
    }
    const data = await getJson<{ standings?: { type?: string; table?: Row[] }[] | null }>(
      `${BASE}/competitions/${code}/standings`,
      { headers: headers(), provider: "football-data" },
    );
    const total = data.standings?.find((s) => s.type === "TOTAL") ?? data.standings?.[0];
    return (total?.table ?? []).map((r, i): StandingRow => ({
      position: r.position ?? i + 1,
      team: team(r.team),
      played: r.playedGames ?? 0,
      won: r.won ?? 0,
      drawn: r.draw ?? 0,
      lost: r.lost ?? 0,
      goalsFor: r.goalsFor ?? 0,
      goalsAgainst: r.goalsAgainst ?? 0,
      goalDifference: r.goalDifference ?? 0,
      points: r.points ?? 0,
    }));
  });
}

export async function fetchMatch(rawId: string): Promise<Match | null> {
  const id = rawId.replace(/^fd:/, "");
  if (!isConfigured()) return null;
  return cached(`fd:match:${id}`, 30_000, async () => {
    try {
      const m = await getJson<FdMatch>(`${BASE}/matches/${id}`, {
        headers: headers(),
        provider: "football-data",
      });
      return m?.id ? toMatch(m) : null;
    } catch {
      return null;
    }
  });
}

export async function fetchH2H(rawId: string, limit = 10): Promise<ResultRow[]> {
  const id = rawId.replace(/^fd:/, "");
  if (!isConfigured()) return [];
  return cached(`fd:h2h:${id}`, 60 * 60_000, async () => {
    try {
      const data = await getJson<{ matches?: FdMatch[] | null }>(
        `${BASE}/matches/${id}/head2head?limit=${limit}`,
        { headers: headers(), provider: "football-data" },
      );
      return (data.matches ?? [])
        .map((m): ResultRow | null => {
          const hg = m.score?.fullTime?.home;
          const ag = m.score?.fullTime?.away;
          if (hg == null || ag == null) return null;
          const h = team(m.homeTeam);
          const a = team(m.awayTeam);
          return {
            homeId: h.id, awayId: a.id, homeName: h.name, awayName: a.name,
            homeGoals: hg, awayGoals: ag,
            date: Date.parse(m.utcDate),
            leagueId: m.competition?.code || "0",
          };
        })
        .filter((r): r is ResultRow => r !== null)
        .sort((a, b) => b.date - a.date);
    } catch {
      return [];
    }
  });
}

export const leaguesWithFdCodes = (): LeagueDef[] =>
  LEAGUES.filter((l) => Boolean(l.ids.footballData));
