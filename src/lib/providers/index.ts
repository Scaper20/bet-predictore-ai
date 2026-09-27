/**
 * Provider resolver.
 *
 * All three feeds can be active at once, and they overlap: football-data and
 * TheSportsDB both carry the Premier League, for example. Rather than picking
 * one winner we query everything configured and merge, preferring the record
 * from the higher-priority feed whenever two describe the same fixture. That
 * way NPFL coverage from API-Football and broad live scores from TheSportsDB
 * both survive alongside football-data's richer European data.
 *
 * No adapter ever fabricates a fixture. If every feed comes back empty, the
 * caller gets an empty list and the UI renders an explicit empty state.
 */

import type { Match, ProviderHealth, ProviderId, ResultRow, StandingRow } from "@/lib/types";
import { leagueByCode as leagueByCodeSync, rankLeague, type LeagueDef } from "@/lib/leagues";
import * as fd from "./football-data";
import * as af from "./api-football";
import * as sdb from "./thesportsdb";

/** Lower index wins when the same fixture appears in several feeds. */
const PRIORITY: ProviderId[] = ["football-data", "api-football", "thesportsdb"];

export function providerHealth(): ProviderHealth[] {
  return [
    {
      id: "football-data",
      label: "football-data.org",
      configured: fd.isConfigured(),
      note: "Top European competitions, full result sets. Free tier: 10 req/min.",
    },
    {
      id: "api-football",
      label: "API-Football",
      configured: af.isConfigured(),
      note: "Widest coverage including NPFL and CAF competitions. Free tier: 100 req/day.",
    },
    {
      id: "thesportsdb",
      label: "TheSportsDB",
      configured: true,
      note: sdb.isFreeTierKey
        ? "Active on the shared public key — live scores are complete, list endpoints are truncated."
        : "Active with a private key: full list coverage.",
    },
  ];
}

/** True when at least one feed beyond the truncated public key is available. */
export function hasFullCoverage(): boolean {
  return fd.isConfigured() || af.isConfigured() || !sdb.isFreeTierKey;
}

/**
 * Identity for de-duplication: two feeds describe the same fixture when the
 * clubs and the kickoff day line up. Club names differ slightly between feeds
 * ("Man City" vs "Manchester City"), so names are normalised hard first.
 */
function fixtureKey(m: Match): string {
  const day = m.kickoff.slice(0, 10);
  return `${day}|${normaliseClub(m.home.name)}|${normaliseClub(m.away.name)}`;
}

function normaliseClub(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|afc|cf|sc|ac|as|ss|ssc|bk|sk|if|club|de|the)\b/g, "")
    .replace(/\bmanchester\b/g, "man")
    .replace(/\bunited\b/g, "utd")
    .replace(/\bwolverhampton wanderers\b/g, "wolves")
    .replace(/\btottenham hotspur\b/g, "tottenham")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function mergeMatches(groups: Match[][]): Match[] {
  const byKey = new Map<string, Match>();
  for (const group of groups) {
    for (const m of group) {
      const key = fixtureKey(m);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, m);
        continue;
      }
      // Keep the higher-priority record, but never lose a live score.
      const winner =
        PRIORITY.indexOf(m.source) < PRIORITY.indexOf(existing.source) ? m : existing;
      const other = winner === m ? existing : m;
      byKey.set(key, enrich(winner, other));
    }
  }
  return [...byKey.values()].sort(compareMatches);
}

/** Fill gaps in the preferred record from the runner-up feed. */
function enrich(primary: Match, secondary: Match): Match {
  return {
    ...primary,
    minute: primary.minute ?? secondary.minute,
    venue: primary.venue ?? secondary.venue,
    round: primary.round ?? secondary.round,
    score: {
      home: primary.score.home ?? secondary.score.home,
      away: primary.score.away ?? secondary.score.away,
    },
    halftime: primary.halftime ?? secondary.halftime,
    home: { ...primary.home, crest: primary.home.crest ?? secondary.home.crest },
    away: { ...primary.away, crest: primary.away.crest ?? secondary.away.crest },
    league: {
      ...primary.league,
      logo: primary.league.logo ?? secondary.league.logo,
      code: primary.league.code ?? secondary.league.code,
    },
  };
}

/** Live first, then by league importance to this audience, then kickoff. */
export function compareMatches(a: Match, b: Match): number {
  const liveRank = (m: Match) => (m.status === "live" || m.status === "halftime" ? 0 : 1);
  const l = liveRank(a) - liveRank(b);
  if (l !== 0) return l;

  const r = rankLeague(a.league.code) - rankLeague(b.league.code);
  if (r !== 0) return r;

  return Date.parse(a.kickoff) - Date.parse(b.kickoff);
}

/** Run every configured adapter, tolerating individual failures. */
async function gather<T>(tasks: Promise<T[]>[]): Promise<T[][]> {
  const settled = await Promise.allSettled(tasks);
  return settled.map((s) => (s.status === "fulfilled" ? s.value : []));
}

export async function getLive(): Promise<Match[]> {
  const groups = await gather<Match>([fd.fetchLive(), af.fetchLive(), sdb.fetchLive()]);
  return mergeMatches(groups).filter(
    (m) => m.status === "live" || m.status === "halftime",
  );
}

export async function getByDate(date: string): Promise<Match[]> {
  const groups = await gather<Match>([
    fd.fetchByDate(date),
    af.fetchByDate(date),
    sdb.fetchByDate(date),
  ]);
  return mergeMatches(groups);
}

/**
 * Upcoming fixtures over the next `days` days.
 *
 * football-data can answer a whole window in one request; the other feeds are
 * per-day, so those are fanned out but capped to keep free-tier quotas intact.
 */
export async function getUpcoming(days = 7, leagueCode?: string): Promise<Match[]> {
  const dates = upcomingDates(days);
  const windowTasks: Promise<Match[]>[] = [
    fd.fetchRange(dates[0], dates[dates.length - 1]),
  ];

  // Per-day fan-out for the feeds without a range endpoint.
  const perDayCap = Math.min(days, 4);
  for (const d of dates.slice(0, perDayCap)) {
    windowTasks.push(sdb.fetchByDate(d));
    if (af.isConfigured()) windowTasks.push(af.fetchByDate(d));
  }

  // League-specific endpoints reach further ahead than the day scan.
  if (leagueCode) {
    const league = leagueByCodeSync(leagueCode);
    if (league) {
      windowTasks.push(fd.fetchLeagueUpcoming(league));
      windowTasks.push(af.fetchLeagueUpcoming(league));
      windowTasks.push(sdb.fetchLeagueUpcoming(league));
    }
  }

  const groups = await gather<Match>(windowTasks);
  const horizon = Date.now() + days * 86_400_000;

  return mergeMatches(groups).filter((m) => {
    if (m.status === "finished" || m.status === "cancelled") return false;
    const ts = Date.parse(m.kickoff);
    // Allow a small grace window so in-progress games stay visible.
    if (ts < Date.now() - 3 * 60 * 60 * 1000 || ts > horizon) return false;
    if (leagueCode && m.league.code !== leagueCode) return false;
    return true;
  });
}

/**
 * Single-fixture lookup, with a fallback to the aggregated feeds.
 *
 * Every other getter in this file tolerates individual provider failures via
 * `gather()` and a merge across all three feeds. This one can't merge — a
 * match id is provider-specific — so a rate limit or transient outage on the
 * one provider that owns this id used to 404 a fixture the user just clicked
 * from a list that rendered it fine seconds earlier (that list came from the
 * merged, multi-provider feed). Falling back to those same cached feeds
 * recovers exactly that case at near-zero extra cost, since they're normally
 * already warm.
 */
export async function getMatch(id: string): Promise<Match | null> {
  // Caught here rather than trusted to each adapter: fd/sdb's fetchMatch
  // already swallow their own errors, but af's doesn't, and the fallback
  // below must run regardless of which adapter a future change touches.
  const direct = await fetchDirect(id).catch(() => null);
  if (direct) return direct;
  return findInFeeds(id);
}

async function fetchDirect(id: string): Promise<Match | null> {
  if (id.startsWith("fd:")) return fd.fetchMatch(id);
  if (id.startsWith("af:")) return af.fetchMatch(id);
  if (id.startsWith("sdb:")) return sdb.fetchMatch(id);
  return null;
}

async function findInFeeds(id: string): Promise<Match | null> {
  const today = upcomingDates(1)[0];
  const yesterday = upcomingDates(1, new Date(Date.now() - 86_400_000))[0];
  const groups = await gather<Match>([
    getLive(),
    getUpcoming(7),
    getByDate(today),
    getByDate(yesterday),
  ]);
  for (const group of groups) {
    const match = group.find((m) => m.id === id);
    if (match) return match;
  }
  return null;
}

/** Minimum completed matches before a league fit is considered usable. */
export const MIN_TRAINING_ROWS = 40;

/**
 * Historical results used to fit the model.
 *
 * In the opening weeks of a campaign the current season holds almost no
 * completed matches, so this walks backwards through previous seasons until it
 * has a usable sample. That is also the statistically correct thing to do:
 * early-season ratings should lean on the prior campaign rather than
 * over-reacting to two matchdays.
 *
 * Results from every configured feed are combined and de-duplicated on club
 * pair plus date, since deeper history means a better fit.
 */
export async function getSeasonResults(
  league: LeagueDef,
  opts: { minRows?: number; maxSeasons?: number } = {},
): Promise<ResultRow[]> {
  const { minRows = MIN_TRAINING_ROWS, maxSeasons = 3 } = opts;
  const sdbSplit = sdb.seasonLabels(maxSeasons);
  const currentYear = af.seasonYear();

  const seen = new Map<string, ResultRow>();
  const add = (rows: ResultRow[]) => {
    for (const r of rows) {
      const key = `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseClub(r.homeName)}|${normaliseClub(r.awayName)}`;
      if (!seen.has(key)) seen.set(key, r);
    }
  };

  for (let i = 0; i < maxSeasons; i++) {
    const year = currentYear - i;
    const groups = await gather<ResultRow>([
      fd.fetchSeasonResults(league, i === 0 ? undefined : year),
      af.fetchSeasonResults(league, year),
      sdb.fetchSeasonResults(league, sdbSplit[i]),
    ]);
    groups.forEach(add);

    /*
     * TheSportsDB keys European seasons "2026-2027" and single-calendar-year
     * competitions "2026", and which applies is a property of the competition
     * that no payload states. Asking only for the split form returned zero
     * rows for every South American league in the catalogue — Brasileirao
     * trained on nothing at all despite having a correct league id.
     *
     * Tried only when the split label came back empty, rather than firing both
     * every time. The public key rate-limits hard enough that doubling the
     * request count starves the leagues at the end of the catalogue, which is
     * a worse failure than the one being fixed.
     */
    if (seen.size === 0) {
      add(await sdb.fetchSeasonResults(league, String(year)));
    }

    if (seen.size >= minRows) break;
  }

  return [...seen.values()].sort((a, b) => a.date - b.date);
}

/**
 * Training data for one specific fixture.
 *
 * Prefers the curated catalogue (which can draw on every configured feed), but
 * falls back to the fixture's own upstream league id so that a match from a
 * competition we do not curate is still modelled against its own league rather
 * than borrowing another league's ratings — which would be silently wrong.
 *
 * Returns the rows plus which league they actually describe, so callers can be
 * honest in the UI about what the prediction is based on.
 */
export async function getTrainingResults(
  match: Match,
): Promise<{ rows: ResultRow[]; leagueName: string; curated: boolean }> {
  const curated = match.league.code ? leagueByCodeSync(match.league.code) : undefined;

  if (curated) {
    const rows = await getSeasonResults(curated);
    if (rows.length > 0) {
      return { rows, leagueName: curated.name, curated: true };
    }
  }

  // Uncurated competition: fit it against its own history. Both season-label
  // conventions are tried, since the payload does not say which one applies.
  const seasons = sdb.seasonCandidates(3);
  const seen = new Map<string, ResultRow>();
  for (const season of seasons) {
    const rows = await sdb.fetchSeasonResultsByLeagueId(match.league.id, season);
    for (const r of rows) {
      const key = `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseClub(r.homeName)}|${normaliseClub(r.awayName)}`;
      if (!seen.has(key)) seen.set(key, r);
    }
    if (seen.size >= MIN_TRAINING_ROWS) break;
  }

  return {
    rows: [...seen.values()].sort((a, b) => a.date - b.date),
    leagueName: match.league.name,
    curated: false,
  };
}

export async function getStandings(league: LeagueDef): Promise<StandingRow[]> {
  const groups = await gather<StandingRow>([
    fd.fetchStandings(league),
    af.fetchStandings(league),
    sdb.fetchStandings(league),
  ]);
  // Standings are not mergeable — take the first feed that returned a table.
  return groups.find((g) => g.length > 0) ?? [];
}

export async function getH2H(match: Match): Promise<ResultRow[]> {
  const tasks: Promise<ResultRow[]>[] = [];
  if (match.id.startsWith("fd:")) tasks.push(fd.fetchH2H(match.id));
  if (match.id.startsWith("af:")) tasks.push(af.fetchH2H(match.home.id, match.away.id));
  tasks.push(sdb.fetchH2H(match.home.name, match.away.name));

  const groups = await gather<ResultRow>(tasks);
  const seen = new Map<string, ResultRow>();
  for (const rows of groups) {
    for (const r of rows) {
      const key = `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseClub(r.homeName)}|${normaliseClub(r.awayName)}`;
      if (!seen.has(key)) seen.set(key, r);
    }
  }
  return [...seen.values()].sort((a, b) => b.date - a.date);
}

export function upcomingDates(days: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export { normaliseClub };
