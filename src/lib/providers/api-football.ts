/**
 * API-Football (api-sports.io) adapter — the widest-coverage option.
 *
 * This is the only one of the three that covers the NPFL and the CAF
 * competitions properly, which matters for the home market. The free tier
 * allows 100 requests/day, so TTLs here are deliberately long.
 * Set API_FOOTBALL_KEY to enable it.
 */

import type { Match, MatchStatus, ResultRow, StandingRow, Team } from "@/lib/types";
import { LEAGUES, leagueByProviderId, type LeagueDef } from "@/lib/leagues";
import { getJson } from "./http";
import { cached } from "./cache";

const BASE = "https://v3.football.api-sports.io";

export const apiKey = (): string | undefined =>
  process.env.API_FOOTBALL_KEY?.trim() || undefined;

export const isConfigured = (): boolean => Boolean(apiKey());

function headers(): Record<string, string> {
  const k = apiKey();
  return k ? { "x-apisports-key": k } : {};
}

interface AfFixture {
  fixture: {
    id: number;
    date: string;
    venue?: { name?: string | null } | null;
    status?: { short?: string | null; elapsed?: number | null } | null;
  };
  league?: {
    id?: number; name?: string; country?: string; logo?: string; round?: string;
  } | null;
  teams?: {
    home?: { id?: number; name?: string; logo?: string } | null;
    away?: { id?: number; name?: string; logo?: string } | null;
  } | null;
  goals?: { home?: number | null; away?: number | null } | null;
  score?: { halftime?: { home?: number | null; away?: number | null } | null } | null;
}

function team(t: { id?: number; name?: string; logo?: string } | null | undefined): Team {
  const name = t?.name?.trim() || "Unknown";
  return {
    id: t?.id != null ? String(t.id) : `name:${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    shortName: name,
    crest: t?.logo,
  };
}

/** API-Football short codes: NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC… */
function mapStatus(short: string | null | undefined): MatchStatus {
  switch ((short || "").toUpperCase()) {
    case "1H":
    case "2H":
    case "ET":
    case "P":
    case "BT":
    case "LIVE":
      return "live";
    case "HT":
      return "halftime";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function toMatch(f: AfFixture): Match {
  const def = leagueByProviderId("apiFootball", f.league?.id);
  return {
    id: `af:${f.fixture.id}`,
    kickoff: new Date(f.fixture.date).toISOString(),
    status: mapStatus(f.fixture.status?.short),
    minute: f.fixture.status?.elapsed ?? null,
    league: {
      id: String(f.league?.id ?? "0"),
      name: f.league?.name || def?.name || "Football",
      country: f.league?.country || def?.country,
      logo: f.league?.logo,
      code: def?.code,
    },
    home: team(f.teams?.home),
    away: team(f.teams?.away),
    score: { home: f.goals?.home ?? null, away: f.goals?.away ?? null },
    halftime: f.score?.halftime
      ? { home: f.score.halftime.home ?? null, away: f.score.halftime.away ?? null }
      : undefined,
    venue: f.fixture.venue?.name || null,
    round: f.league?.round || null,
    source: "api-football",
  };
}

async function fixtures(query: string, key: string, ttlMs: number): Promise<Match[]> {
  if (!isConfigured()) return [];
  return cached(`af:${key}`, ttlMs, async () => {
    const data = await getJson<{ response?: AfFixture[] | null }>(
      `${BASE}/fixtures?${query}`,
      { headers: headers(), provider: "api-football" },
    );
    return (data.response ?? []).map(toMatch);
  });
}

export function fetchLive(): Promise<Match[]> {
  return fixtures("live=all", "live", 25_000);
}

export function fetchByDate(date: string): Promise<Match[]> {
  return fixtures(`date=${encodeURIComponent(date)}`, `day:${date}`, 5 * 60_000);
}

export function fetchLeagueUpcoming(league: LeagueDef): Promise<Match[]> {
  const id = league.ids.apiFootball;
  if (!id) return Promise.resolve([]);
  return fixtures(`league=${id}&season=${seasonYear()}&next=20`, `next:${id}`, 15 * 60_000);
}

/** `season` is the starting year (2025 = the 2025/26 campaign). */
export async function fetchSeasonResults(
  league: LeagueDef,
  seasonOverride?: number,
): Promise<ResultRow[]> {
  const id = league.ids.apiFootball;
  if (!isConfigured() || !id) return [];
  const season = seasonOverride ?? seasonYear();
  return cached(`af:results:${id}:${season}`, 60 * 60_000, async () => {
    const data = await getJson<{ response?: AfFixture[] | null }>(
      `${BASE}/fixtures?league=${id}&season=${season}&status=FT`,
      { headers: headers(), provider: "api-football" },
    );
    return (data.response ?? [])
      .map((f): ResultRow | null => {
        const hg = f.goals?.home;
        const ag = f.goals?.away;
        if (hg == null || ag == null) return null;
        const h = team(f.teams?.home);
        const a = team(f.teams?.away);
        return {
          homeId: h.id, awayId: a.id, homeName: h.name, awayName: a.name,
          homeGoals: hg, awayGoals: ag,
          date: Date.parse(f.fixture.date),
          leagueId: String(id),
        };
      })
      .filter((r): r is ResultRow => r !== null);
  });
}

export async function fetchStandings(league: LeagueDef): Promise<StandingRow[]> {
  const id = league.ids.apiFootball;
  if (!isConfigured() || !id) return [];
  const season = seasonYear();
  return cached(`af:table:${id}:${season}`, 60 * 60_000, async () => {
    interface Row {
      rank?: number;
      team?: { id?: number; name?: string; logo?: string };
      points?: number; goalsDiff?: number;
      all?: {
        played?: number; win?: number; draw?: number; lose?: number;
        goals?: { for?: number; against?: number };
      };
    }
    const data = await getJson<{
      response?: { league?: { standings?: Row[][] } }[] | null;
    }>(`${BASE}/standings?league=${id}&season=${season}`, {
      headers: headers(),
      provider: "api-football",
    });
    const table = data.response?.[0]?.league?.standings?.[0] ?? [];
    return table.map((r, i): StandingRow => ({
      position: r.rank ?? i + 1,
      team: team(r.team),
      played: r.all?.played ?? 0,
      won: r.all?.win ?? 0,
      drawn: r.all?.draw ?? 0,
      lost: r.all?.lose ?? 0,
      goalsFor: r.all?.goals?.for ?? 0,
      goalsAgainst: r.all?.goals?.against ?? 0,
      goalDifference: r.goalsDiff ?? 0,
      points: r.points ?? 0,
    }));
  });
}

export async function fetchMatch(rawId: string): Promise<Match | null> {
  const id = rawId.replace(/^af:/, "");
  if (!isConfigured()) return null;
  const list = await fixtures(`id=${encodeURIComponent(id)}`, `id:${id}`, 30_000);
  return list[0] ?? null;
}

export async function fetchH2H(homeId: string, awayId: string): Promise<ResultRow[]> {
  if (!isConfigured()) return [];
  const pair = `${homeId}-${awayId}`;
  return cached(`af:h2h:${pair}`, 60 * 60_000, async () => {
    try {
      const data = await getJson<{ response?: AfFixture[] | null }>(
        `${BASE}/fixtures/headtohead?h2h=${encodeURIComponent(pair)}&last=10`,
        { headers: headers(), provider: "api-football" },
      );
      return (data.response ?? [])
        .map((f): ResultRow | null => {
          const hg = f.goals?.home;
          const ag = f.goals?.away;
          if (hg == null || ag == null) return null;
          const h = team(f.teams?.home);
          const a = team(f.teams?.away);
          return {
            homeId: h.id, awayId: a.id, homeName: h.name, awayName: a.name,
            homeGoals: hg, awayGoals: ag,
            date: Date.parse(f.fixture.date),
            leagueId: String(f.league?.id ?? "0"),
          };
        })
        .filter((r): r is ResultRow => r !== null)
        .sort((a, b) => b.date - a.date);
    } catch {
      return [];
    }
  });
}

/** API-Football keys seasons by starting year: 2026/27 is season 2026. */
export function seasonYear(now = new Date()): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? y : y - 1;
}

export const leaguesWithAfIds = (): LeagueDef[] =>
  LEAGUES.filter((l) => Boolean(l.ids.apiFootball));
