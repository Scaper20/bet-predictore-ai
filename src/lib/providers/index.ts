/**
 * Provider resolver.
 *
 * The feeds are queried together and merged, because each is best at
 * something different:
 *
 * - football-data.org: the reference record for its twelve competitions.
 *   Clean names, crests, matchdays, tables, untruncated results. Its free-plan
 *   scores are delayed, so it is never trusted for what is happening now.
 * - TheSportsDB: real-time live scores for every competition, plus the
 *   leagues football-data doesn't carry (NPFL, CAF, internationals, the rest
 *   of the world), and extra training depth with a paid key.
 * - API-Football: optional; used when its account is active.
 *
 * When two feeds describe the same fixture, the higher-PRIORITY record wins
 * on identity (id, names, league, round), and the in-play fields (status,
 * score, minute) come from whichever record has progressed furthest, with
 * LIVE_PRIORITY breaking ties. So a Premier League game shows football-data's
 * crest and matchday with TheSportsDB's live score.
 *
 * No adapter ever fabricates a fixture. If every feed comes back empty, the
 * caller gets an empty list and the UI renders an explicit empty state.
 */

import type { Match, ProviderHealth, ProviderId, ResultRow, StandingRow } from "@/lib/types";
import { internationalPool, leagueByCode as leagueByCodeSync, rankLeague, type LeagueDef } from "@/lib/leagues";
import * as fd from "./football-data";
import * as af from "./api-football";
import * as sdb from "./thesportsdb";

/** Lower index wins when the same fixture appears in several feeds. */
const PRIORITY: ProviderId[] = ["football-data", "api-football", "thesportsdb"];

/**
 * Who to believe about the score of a game in progress. football-data drops
 * to last unless its paid livescores plan is on, since free-plan scores lag.
 */
function livePriority(): ProviderId[] {
  return fd.hasLivescores()
    ? ["football-data", "thesportsdb", "api-football"]
    : ["thesportsdb", "api-football", "football-data"];
}

export function providerHealth(): ProviderHealth[] {
  const afDown = af.unavailableReason();
  return [
    {
      id: "football-data",
      label: "football-data.org",
      configured: fd.isConfigured(),
      note: fd.hasLivescores()
        ? "Top 12 competitions: fixtures, results, tables, crests and live scores. 10 req/min."
        : "Top 12 competitions: fixtures, results, tables, crests. Free-plan scores are delayed, so live scores come from TheSportsDB. 10 req/min.",
    },
    {
      id: "api-football",
      label: "API-Football",
      configured: af.isConfigured(),
      note: afDown
        ? `Standing down: the account refused requests (${afDown}). Retrying in a few hours.`
        : "Optional. Wide coverage including NPFL and CAF. Free tier: 100 req/day.",
    },
    {
      id: "thesportsdb",
      label: "TheSportsDB",
      configured: true,
      note: sdb.isFreeTierKey
        ? "Public key: real-time live scores for every league, but lists are cut to a few rows. A paid key unlocks full fixtures, NPFL, CAF and training history."
        : "Paid key: real-time live scores (v2), full fixture lists, NPFL, CAF, internationals, team histories. 100 req/min.",
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

/**
 * Looser identity for the pairs fixtureKey misses: feeds disagree on more
 * than suffixes ("Brighton & Hove Albion FC" against "Brighton", "Inter"
 * against "Internazionale"). Same kickoff day, and one side matching while
 * the other at least contains its counterpart, is the same game: no club
 * plays twice in a day.
 */
function sameFixture(a: Match, b: Match): boolean {
  if (a.kickoff.slice(0, 10) !== b.kickoff.slice(0, 10)) return false;
  const near = (x: string, y: string) => x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)));
  const [ah, aa, bh, ba] = [a.home.name, a.away.name, b.home.name, b.away.name].map(normaliseClub);
  if (!ah || !aa || !bh || !ba) return false;
  return (ah === bh && near(aa, ba)) || (aa === ba && near(ah, bh)) || (near(ah, bh) && near(aa, ba) && Math.abs(Date.parse(a.kickoff) - Date.parse(b.kickoff)) <= 15 * 60_000);
}

export function mergeMatches(groups: Match[][]): Match[] {
  const byKey = new Map<string, Match>();
  const byDay = new Map<string, string[]>();
  for (const group of groups) {
    for (const m of group) {
      let key = fixtureKey(m);
      if (!byKey.has(key)) {
        const day = m.kickoff.slice(0, 10);
        const loose = byDay.get(day)?.find((k) => sameFixture(byKey.get(k)!, m));
        if (loose) key = loose;
      }
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, m);
        const day = m.kickoff.slice(0, 10);
        byDay.set(day, [...(byDay.get(day) ?? []), key]);
        continue;
      }
      const winner =
        PRIORITY.indexOf(m.source) < PRIORITY.indexOf(existing.source) ? m : existing;
      const other = winner === m ? existing : m;
      byKey.set(key, enrich(winner, other));
    }
  }
  return [...byKey.values()].sort(compareMatches);
}

/** How far through its life a fixture is, as far as one feed knows. */
function progress(m: Match): number {
  switch (m.status) {
    case "live":
    case "halftime":
      return 1;
    case "finished":
      return 2;
    default:
      return 0;
  }
}

/**
 * Which record to take status, score and minute from. The one that has seen
 * more of the game wins (a delayed feed still saying "scheduled" loses to one
 * saying "live"), except that a finished result from the identity feed is
 * kept: it carries corrections a live feed's last tick may not. Postponed or
 * cancelled from the identity feed always stands.
 */
function liveSource(primary: Match, secondary: Match): Match {
  if (primary.status === "postponed" || primary.status === "cancelled") return primary;
  const p = progress(primary);
  const s = progress(secondary);
  if (s > p) return secondary;
  if (p > s) return primary;
  if (p === 1) {
    const order = livePriority();
    return order.indexOf(secondary.source) < order.indexOf(primary.source) ? secondary : primary;
  }
  return primary;
}

/**
 * Fill gaps in the preferred record from the runner-up feed, and take the
 * in-play fields from whichever is more current.
 */
function enrich(primary: Match, secondary: Match): Match {
  const live = liveSource(primary, secondary);
  const rest = live === primary ? secondary : primary;
  return {
    ...primary,
    status: live.status,
    minute: live.minute ?? (progress(live) === 1 ? rest.minute : null) ?? null,
    venue: primary.venue ?? secondary.venue,
    round: primary.round ?? secondary.round,
    score: {
      home: live.score.home ?? rest.score.home,
      away: live.score.away ?? rest.score.away,
    },
    halftime: live.halftime ?? rest.halftime,
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

  // Per-day fan-out for the feeds without a range endpoint. On TheSportsDB's
  // public key a day returns three games, so scanning far ahead buys nothing;
  // a paid key returns the whole day and is worth scanning the full window.
  const perDayCap = Math.min(days, sdb.isPremium ? 10 : 4);
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
  if (direct) return withLiveScore(direct);
  return findInFeeds(id);
}

/**
 * A single-match lookup asks only the feed that owns the id, which for a top
 * competition is football-data, whose free-plan score lags. Around kickoff,
 * lay the live feed's state over it (the live list is cached for 20 seconds,
 * so this is normally free).
 */
async function withLiveScore(match: Match): Promise<Match> {
  if (match.status === "finished" || match.status === "postponed" || match.status === "cancelled") return match;
  const ko = Date.parse(match.kickoff);
  if (Number.isFinite(ko) && (Date.now() < ko - 10 * 60_000 || Date.now() > ko + 4 * 60 * 60_000)) return match;
  const live = await getLive().catch(() => [] as Match[]);
  const twin = live.find((m) => m.id === match.id || fixtureKey(m) === fixtureKey(match) || sameFixture(m, match));
  return twin && twin.id !== match.id ? enrich(match, twin) : twin ?? match;
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

  if (curated?.confederation) {
    const rows = await getInternationalResults(curated);
    if (rows.length > 0) {
      return { rows, leagueName: `${curated.name} (rated on all ${poolLabel(curated)} internationals)`, curated: true };
    }
  }

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

function poolLabel(league: LeagueDef): string {
  return league.confederation === "global" ? "national-team" : `${league.confederation} and global`;
}

/** Pooled competitions fetched this many at a time: the public TheSportsDB key rate-limits bursts. */
const POOL_CONCURRENCY = sdb.isPremium ? 6 : 3;

/**
 * Results from every competition in a national-team fixture's pool, merged.
 *
 * Two seasons per competition rather than three: the pool already supplies
 * the depth one competition can't, and the extra season would roughly double
 * the requests a cold cache makes for a single prediction.
 */
async function getInternationalResults(league: LeagueDef): Promise<ResultRow[]> {
  const pool = internationalPool(league);
  const seen = new Map<string, ResultRow>();
  for (let i = 0; i < pool.length; i += POOL_CONCURRENCY) {
    const batch = pool.slice(i, i + POOL_CONCURRENCY);
    const groups = await gather<ResultRow>(
      batch.map((l) => getSeasonResults(l, { minRows: Number.POSITIVE_INFINITY, maxSeasons: 2 })),
    );
    for (const rows of groups) {
      for (const r of rows) {
        const key = `${new Date(r.date).toISOString().slice(0, 10)}|${normaliseClub(r.homeName)}|${normaliseClub(r.awayName)}`;
        if (!seen.has(key)) seen.set(key, r);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.date - b.date);
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
  tasks.push(
    sdb.fetchH2H(
      match.home.name,
      match.away.name,
      match.source === "thesportsdb" ? { home: match.home.id, away: match.away.id } : undefined,
    ),
  );

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
