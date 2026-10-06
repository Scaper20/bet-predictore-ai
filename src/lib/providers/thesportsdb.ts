/**
 * TheSportsDB adapter: live scores, and everything football-data doesn't carry.
 *
 * Two modes, picked by THESPORTSDB_API_KEY:
 *
 * - Public test key "123" (no signup): live scores are complete, but list
 *   endpoints are cut to a few rows (3 games a day, 15 a season, 1 "next").
 *   30 requests a minute.
 * - Paid key: the same v1 lists return in full (1,500 games a day, 3,000 a
 *   season, 20 "next", 100-row tables), and the v2 API opens: live scores at
 *   /livescore/{sport} and a team's full schedule (250 games) for
 *   head-to-heads. 100 requests a minute.
 *
 * Its live feed is in real time, where football-data's free plan is delayed,
 * so it owns in-play scores. It is also the only feed here that covers the
 * NPFL, CAF competitions and national-team football.
 */

import type { Match, MatchStatus, ResultRow, StandingRow, Team } from "@/lib/types";
import { sportOrDefault } from "@/lib/sports";
import { LEAGUES, leagueByProviderId, type LeagueDef } from "@/lib/leagues";
import { getJson, RateGate } from "./http";
import { cached } from "./cache";
import { isStaleInPlay } from "@/lib/match-status";

const KEY = process.env.THESPORTSDB_API_KEY?.trim() || "123";
/** What TheSportsDB calls this sport in its `s=` filter. */
const SPORT = sportOrDefault().providers.theSportsDb ?? "Soccer";

const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const V2 = "https://www.thesportsdb.com/api/v2/json";

/** True when running on the shared public key, which is heavily truncated. */
export const isFreeTierKey = KEY === "123";
/** A paid key: full v1 lists plus the v2 API. */
export const isPremium = !isFreeTierKey;

/** Published limits are 30/min free and 100/min paid; stay a little under. */
const gate = new RateGate(
  "thesportsdb",
  Number(process.env.THESPORTSDB_RATE_PER_MIN) || (isPremium ? 95 : 28),
);

/**
 * Most games one eventsday.php call returns. The free key's three makes a
 * per-day scan nearly worthless, which is why callers cap it there.
 */
export const DAY_ROW_LIMIT = isPremium ? 1500 : 3;

function v1<T>(path: string): Promise<T> {
  return getJson<T>(`${BASE}/${path}`, { provider: "thesportsdb", gate });
}

/** v2 is paid-only and takes the key in a header rather than the path. */
function v2<T>(path: string): Promise<T> {
  return getJson<T>(`${V2}${path}`, { provider: "thesportsdb", gate, headers: { "X-API-KEY": KEY } });
}

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
  if (["HT", "HALF TIME", "HALFTIME"].includes(s)) return isStaleInPlay("halftime", kickoff) ? "finished" : "halftime";
  if (["1H", "2H", "ET", "LIVE", "IN PLAY", "PLAYING"].includes(s)) {
    return isStaleInPlay("live", kickoff) ? "finished" : "live";
  }
  if (["PST", "POSTP", "POSTPONED"].includes(s)) return "postponed";
  if (["CANC", "CANCELLED", "ABD", "ABANDONED"].includes(s)) return "cancelled";
  if (s === "NS" || s === "NOT STARTED" || s === "") {
    // Some rows carry no status at all; fall back to the clock.
    return Date.now() > kickoff + 3 * 60 * 60 * 1000 ? "finished" : "scheduled";
  }
  // Numeric progress like "67" means the game is running.
  if (/^\d+\+?$/.test(s)) return isStaleInPlay("live", kickoff) ? "finished" : "live";
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

/**
 * Live soccer scores across every competition the feed tracks.
 *
 * A paid key reads v2's /livescore, the documented home of live scores now;
 * the v1 endpoint stays as the fallback and as the free-key path.
 */
export async function fetchLive(): Promise<Match[]> {
  return cached("sdb:live", 20_000, async () => {
    let rows: SdbLive[] | null | undefined;
    if (isPremium) {
      rows = await v2<{ livescore?: SdbLive[] | null }>(`/livescore/${encodeURIComponent(SPORT.toLowerCase())}`)
        .then((d) => d.livescore)
        .catch(() => undefined);
    }
    rows ??= (await v1<{ livescore?: SdbLive[] | null }>(`livescore.php?s=${encodeURIComponent(SPORT)}`)).livescore;
    return (rows ?? []).map(liveToMatch).filter((m): m is Match => m !== null);
  });
}

/** Every soccer fixture on a given calendar day (YYYY-MM-DD, UTC). */
export async function fetchByDate(date: string): Promise<Match[]> {
  return cached(`sdb:day:${date}`, 5 * 60_000, async () => {
    const data = await v1<{ events?: SdbEvent[] | null }>(`eventsday.php?d=${encodeURIComponent(date)}&s=${encodeURIComponent(SPORT)}`);
    return (data.events ?? []).map(toMatch).filter((m): m is Match => m !== null);
  });
}

/** Upcoming fixtures for one league. */
export async function fetchLeagueUpcoming(league: LeagueDef): Promise<Match[]> {
  const id = league.ids.theSportsDb;
  if (!id) return [];
  return cached(`sdb:next:${id}`, 10 * 60_000, async () => {
    const data = await v1<{ events?: SdbEvent[] | null }>(`eventsnextleague.php?id=${id}`);
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
    const data = await v1<{ events?: SdbEvent[] | null }>(`eventsseason.php?id=${id}&s=${encodeURIComponent(s)}`);
    return (data.events ?? []).map((e) => toResult(e, id)).filter((r): r is ResultRow => r !== null);
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
      const data = await v1<{ events?: SdbEvent[] | null }>(`eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(s)}`);
      return (data.events ?? []).map((e) => toResult(e, leagueId)).filter((r): r is ResultRow => r !== null);
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
    const data = await v1<{ table?: Row[] | null }>(`lookuptable.php?l=${id}&s=${encodeURIComponent(s)}`);
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
      const data = await v1<{ events?: SdbEvent[] | null }>(`lookupevent.php?id=${encodeURIComponent(id)}`);
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

function toResult(e: SdbEvent, fallbackLeague = "0"): ResultRow | null {
  const hg = num(e.intHomeScore ?? null);
  const ag = num(e.intAwayScore ?? null);
  if (hg === null || ag === null || !e.strHomeTeam || !e.strAwayTeam) return null;
  // Some rows for games not yet played carry "0"/"0"; a result that hasn't
  // happened would teach the model a 0-0.
  if (kickoffMs(e) > Date.now()) return null;
  return {
    homeId: e.idHomeTeam || e.strHomeTeam,
    awayId: e.idAwayTeam || e.strAwayTeam,
    homeName: e.strHomeTeam,
    awayName: e.strAwayTeam,
    homeGoals: hg,
    awayGoals: ag,
    date: kickoffMs(e),
    leagueId: e.idLeague || fallbackLeague,
  };
}

/**
 * Head-to-head history between two clubs, newest first.
 *
 * With a paid key and TheSportsDB team ids (a fixture that came from this
 * feed), the home side's full schedule, up to 250 games across every
 * competition, is filtered to meetings with the opponent: far deeper than
 * the name search. Otherwise the name search runs both ways round, since
 * "A_vs_B" only finds games A hosted.
 */
export async function fetchH2H(
  homeName: string,
  awayName: string,
  teamIds?: { home: string; away: string },
): Promise<ResultRow[]> {
  const key = `sdb:h2h:${homeName}|${awayName}|${teamIds?.home ?? ""}`.toLowerCase();
  return cached(key, 60 * 60_000, async () => {
    const rows: ResultRow[] = [];
    if (isPremium && teamIds && /^\d+$/.test(teamIds.home) && /^\d+$/.test(teamIds.away)) {
      const full = await v2<{ schedule?: SdbEvent[] | null; events?: SdbEvent[] | null }>(
        `/schedule/full/team/${teamIds.home}`,
      ).catch(() => null);
      const games = full?.schedule ?? full?.events ?? [];
      for (const e of games) {
        const pair = [e.idHomeTeam, e.idAwayTeam];
        if (!pair.includes(teamIds.home) || !pair.includes(teamIds.away)) continue;
        const r = toResult(e);
        if (r) rows.push(r);
      }
    }
    if (rows.length === 0) {
      const searches = [`${homeName}_vs_${awayName}`, ...(isPremium ? [`${awayName}_vs_${homeName}`] : [])];
      const found = await Promise.all(
        searches.map((q) =>
          v1<{ event?: SdbEvent[] | null }>(`searchevents.php?e=${encodeURIComponent(q)}`)
            .then((d) => d.event ?? [])
            // H2H is best-effort; absence must not fail a match page.
            .catch(() => [] as SdbEvent[]),
        ),
      );
      for (const e of found.flat()) {
        const r = toResult(e);
        if (r) rows.push(r);
      }
    }
    return rows.sort((a, b) => b.date - a.date);
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
