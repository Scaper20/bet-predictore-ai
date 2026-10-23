import "server-only";

import { LEAGUES, type LeagueDef } from "@/lib/leagues";
import { dbUpcoming } from "@/lib/providers/db-source";
import { sportyBetBoard } from "./sportybet";
import { directEnabled } from "./sportybet-direct";
import { memoryFor, saveEventLinks, saveLearned, saveUnresolved, storedEventLinks } from "./sportybet-links";
import { matchRound, type MatchMethod, type OurFixture } from "./sportybet-match";

/**
 * Matches every upcoming fixture in every competition SportyBet lists, a
 * whole round at a time, and stores what it learns.
 *
 * A whole round is what makes the elimination pass sound, and doing it ahead
 * of time is what makes a booking fast: by the time a user asks for a code,
 * every leg is already a stored event id. Run hourly from the odds snapshot
 * and daily from its own cron (vercel.json), and on demand from
 * /admin/sportybet.
 */

/** How far ahead to match. SportyBet rarely lists more than two rounds. */
const DAYS_AHEAD = 10;

export interface LeagueSyncReport {
  league: string;
  fixtures: number;
  events: number;
  /** Fixtures with a SportyBet event in the kickoff window at all. */
  listed: number;
  matched: number;
  byMethod: Partial<Record<MatchMethod | "stored", number>>;
  learned: number;
  unresolved: number;
  error?: string;
}

export async function syncLeague(league: LeagueDef): Promise<LeagueSyncReport> {
  const report: LeagueSyncReport = {
    league: league.code,
    fixtures: 0,
    events: 0,
    listed: 0,
    matched: 0,
    byMethod: {},
    learned: 0,
    unresolved: 0,
  };
  const tournamentId = league.ids.sportyBet;
  if (!tournamentId) return { ...report, error: "no SportyBet tournament id" };

  try {
    const [events, matches] = await Promise.all([sportyBetBoard(tournamentId, true), dbUpcoming(DAYS_AHEAD, league.code)]);
    report.events = events.length;
    const fixtures: OurFixture[] = matches
      .filter((m) => m.status === "scheduled")
      .map((m) => ({ matchId: m.id, homeName: m.home.name, awayName: m.away.name, kickoff: Date.parse(m.kickoff) }));
    report.fixtures = fixtures.length;
    if (events.length === 0 || fixtures.length === 0) return report;

    // A fixture already linked to an event still on the board is settled;
    // the rest go to the matcher with the whole board, since an event can
    // only belong to one fixture and a settled one is out of play.
    const settled = new Set<string>();
    const taken = new Set<string>();
    const links = await storedEventLinks(fixtures.map((f) => f.matchId));
    for (const f of fixtures) {
      const stored = links.get(f.matchId);
      if (stored && events.some((e) => e.eventId === stored.eventId)) {
        settled.add(f.matchId);
        taken.add(stored.eventId);
      }
    }
    report.byMethod.stored = settled.size;

    const open = fixtures.filter((f) => !settled.has(f.matchId));
    const memory = await memoryFor(
      league.code,
      fixtures.flatMap((f) => [f.homeName, f.awayName]),
    );
    const out = matchRound({
      ...memory,
      fixtures: open,
      events: events.filter((e) => !taken.has(e.eventId)),
      eliminate: true,
    });

    await saveLearned(league.code, out.learned);
    await saveEventLinks(
      league.code,
      out.matched.map((m) => ({ matchId: m.matchId, event: m.event, method: m.method })),
    );
    const byId = new Map(fixtures.map((f) => [f.matchId, f]));
    await saveUnresolved(
      league.code,
      byId,
      out.unresolved.filter((u) => u.candidates.length > 0),
    );

    for (const m of out.matched) report.byMethod[m.method] = (report.byMethod[m.method] ?? 0) + 1;
    report.matched = settled.size + out.matched.length;
    report.learned = out.learned.length;
    report.unresolved = out.unresolved.filter((u) => u.candidates.length > 0).length;
    report.listed = fixtures.filter((f) =>
      events.some((e) => Math.abs(e.kickoff - f.kickoff) <= 6 * 3_600_000),
    ).length;
    return report;
  } catch (err) {
    return { ...report, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Every competition with a SportyBet id, one after another to stay polite. */
export async function syncSportyBet(only?: readonly string[]): Promise<LeagueSyncReport[] | null> {
  if (!(await directEnabled())) return null;
  const reports: LeagueSyncReport[] = [];
  for (const league of LEAGUES) {
    if (!league.ids.sportyBet) continue;
    if (only && !only.includes(league.code)) continue;
    reports.push(await syncLeague(league));
  }
  return reports;
}
